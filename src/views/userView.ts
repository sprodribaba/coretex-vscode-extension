// Copyright (C) 2023  Coretex LLC

// This file is part of Coretex.ai  

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as fs from 'fs';
import { getNonce } from '../utilities/getNonce';

export class UserView implements vscode.WebviewViewProvider {
	viewId = 'coretex.user';
	private _view?: vscode.WebviewView;
    organizationConf = 'OrganizationID'

	constructor(private readonly _extensionUri: vscode.Uri) {}

	public resolveWebviewView(webviewView: vscode.WebviewView): void {
		this._view = webviewView;

		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,

			localResourceRoots: [
				this._extensionUri
			]
		};

		this.updateView();

		this._view.onDidChangeVisibility(async event => {
			this.updateView();
		});

		this._view.webview.onDidReceiveMessage(data => {
			this.runCommand(data);
		});
	}

	private updateView(): void {
		if (!this._view) {
			return;
		}

        let dirPath = this.getCLIConfigDir()
		const configDirArray = dirPath.split('\n')

		if (configDirArray.length > 1) {
			dirPath = configDirArray[0]
		}

		const configFilePath = dirPath + '/config.json'

		// Wathc for config change
		var watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(`${dirPath}`), '*.json'));
		watcher.onDidChange(() => {
			this.updateView();
		});

		if (fs.existsSync(configFilePath)) {
			const configuration = JSON.parse(fs.readFileSync(configFilePath, { encoding: 'utf-8' }))

			if (configuration.organizationID) {
				vscode.workspace.getConfiguration().update(this.organizationConf, configuration.organizationID, vscode.ConfigurationTarget.Global);
			}

			this._view.webview.html = this.getWebviewContent(this._view.webview, configuration.username ? configuration.username : '');
		} else {
			this._view.webview.html = this.getWebviewContent(this._view.webview, '');
		}
	}

	private runCommand(data: any) {
		switch (data.type) {
			case 'login':
				{
					vscode.commands.executeCommand('coretex.configureUser');
					break;
				}
		}
	}

	private isCoretexCLIDetected(): boolean {
		const platform = process.platform;
		const command = 'coretex --version';
		if (platform === 'darwin' || platform === 'linux') {
			try {
				child_process.execSync(command);
				return true;
			} catch (error) {
				return false;
			}
		} else if (platform === 'win32') {
			try {
				child_process.execSync(command);
				return true;
			} catch (error) {
				try {
					child_process.execSync('coretex.exe --version');
					return true;
				} catch (error) {
					return false;
				}
			}
		}
	
		return false;
	}

	private getWebviewContent(webview: vscode.Webview, username: string): string {
		const viewStyle = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'views.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'userViewScripts.js'));

		// Use a nonce to only allow a specific script to be run.
		const nonce = getNonce();
        
        const conf = vscode.workspace.getConfiguration();
		const organizationID = conf.get<{}>(this.organizationConf);

		const loginStyle = this.isCoretexCLIDetected() ? 'login-action button' : 'hidden'
		const infoStyle = !this.isCoretexCLIDetected() ? 'info' : 'hidden'

		return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${viewStyle}" rel="stylesheet">
				<title>Help</title>
			</head>
			<body>
                <p class="subtitle">${username == '' ? 'Not logged in': username}</p>
				<div class="column">
                	<text class="info">Organization ID: </text>
                	<text class="subtitle">${organizationID == '' ? '[Refresh after login]' : organizationID}</text>
				</div>
			    <button class="${loginStyle}">Log In</button>
				<text class="${infoStyle}">Make sure you have latest CLI version installed.</text>
                <script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>
		`;
	}

    private getCLIConfigDir(): string {
		const command = 'coretex config --user --path'
		const platform = process.platform;
		if (platform === 'darwin' || platform === 'linux') {
			try {
				const version = child_process.execSync(command);
				return version.toString();
			} catch (error) {
				return '';
			}
		} else if (platform === 'win32') {
			try {
				const version = child_process.execSync(command);
				return version.toString();
			} catch (error) {
				try {
					const version = child_process.execSync('coretex.exe config --user --path');
					return version.toString();
				} catch (error) {
					return '';
				}
			}
		}

		return '';
	}
}
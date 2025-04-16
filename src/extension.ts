// VSCode キーロガー拡張機能
// キーストロークと定期的なコード差分を記録

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

// ログを保存するためのファイルパス
let logFilePath: string;
let diffLogFilePath: string;
// 最後にハッシュ値を計算した時点でのログ内容
let lastHashedContent: string = '';
// 最後のキーストロークのタイムスタンプ
let lastKeystrokeTime: number = Date.now();
// ドキュメントの前回の内容を保存する辞書
let documentContentCache: Map<string, { content: string, timestamp: number }> = new Map();
// 差分を取るためのインターバルID
let diffIntervalId: NodeJS.Timeout | null = null;

export function activate(context: vscode.ExtensionContext) {
	console.log('純粋キーロガー拡張機能がアクティブになりました');

	// ログファイルのパスを設定
	const logsDir = path.join(context.extensionPath, 'logs');
	if (!fs.existsSync(logsDir)) {
		fs.mkdirSync(logsDir);
	}

	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	logFilePath = path.join(logsDir, `keylog_${timestamp}.txt`);
	diffLogFilePath = path.join(logsDir, `diff_log_${timestamp}.txt`);

	// 起動時にログファイルを作成または初期化
	initLogFile();

	// キー入力をリッスンする
	const keyLoggerDisposable = vscode.workspace.onDidChangeTextDocument(event => {
		if (event.contentChanges.length === 0) {
			return;
		}

		const document = event.document;
		const fileName = document.fileName;
		const timestamp = Date.now();
		const timeSinceLast = timestamp - lastKeystrokeTime;
		lastKeystrokeTime = timestamp;

		// キー入力を記録
		event.contentChanges.forEach(change => {
			// 入力されたテキストを取得
			const inputText = change.text;

			// 削除された文字列を取得
			const rangeLength = change.rangeLength;
			const deletedText = rangeLength > 0 ? `${rangeLength}文字削除` : '';

			// キー入力とその詳細をログに記録
			const logEntry = `[${new Date(timestamp).toISOString()}][${path.basename(fileName)}] ` +
				`キー: "${inputText.replace(/\n/g, '\\n')}" ` +
				`${deletedText ? `削除: "${deletedText}" ` : ''}` +
				`位置: L${change.range.start.line + 1}:C${change.range.start.character + 1} ` +
				`間隔: ${timeSinceLast}ms\n`;

			fs.appendFileSync(logFilePath, logEntry);

			// 現在のドキュメント内容をキャッシュに保存
			documentContentCache.set(fileName, {
				content: document.getText(),
				timestamp
			});
		});

		// 一定間隔でログファイルのハッシュ値を更新
		updateLogFileHash();
	});

	// 3秒ごとにコード差分を取得するインターバルを設定
	diffIntervalId = setInterval(() => {
		captureDocumentDiffs();
	}, 3000);

	// 定期的にハッシュ値を検証
	const hashVerificationInterval = setInterval(() => {
		verifyLogFileIntegrity();
	}, 60000); // 1分ごとに検証

	context.subscriptions.push(keyLoggerDisposable);
	context.subscriptions.push({
		dispose: () => {
			if (diffIntervalId) {
				clearInterval(diffIntervalId);
			}
			clearInterval(hashVerificationInterval);
		}
	});

	// ステータスバーにインジケータを表示
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.text = "$(keyboard) キーロガー動作中";
	statusBarItem.tooltip = "キーロガーと差分記録が動作しています";
	statusBarItem.show();

	context.subscriptions.push(statusBarItem);
}

// 3秒ごとのドキュメント差分を記録
function captureDocumentDiffs() {
	try {
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) { return; }

		const document = activeEditor.document;
		const fileName = document.fileName;
		const currentContent = document.getText();
		const timestamp = Date.now();

		// 前回の内容を取得
		const previousRecord = documentContentCache.get(fileName);

		if (previousRecord) {
			const previousContent = previousRecord.content;
			const previousTimestamp = previousRecord.timestamp;

			// 内容が変更されていれば差分を計算
			if (currentContent !== previousContent) {
				const diffTimestamp = new Date(timestamp).toISOString();
				const timeSinceLastCapture = timestamp - previousTimestamp;

				// 差分情報のヘッダー
				let diffLog = `\n==== 差分検出 [${diffTimestamp}] ====\n`;
				diffLog += `ファイル: ${fileName}\n`;
				diffLog += `前回の記録から: ${timeSinceLastCapture}ms\n`;

				// 単純な差分計算（行ごとに比較）
				const prevLines = previousContent.split('\n');
				const currLines = currentContent.split('\n');

				// 差分の詳細を記録
				diffLog += `前の行数: ${prevLines.length}, 現在の行数: ${currLines.length}\n`;

				// 行ごとの差分を計算
				const maxLines = Math.max(prevLines.length, currLines.length);
				for (let i = 0; i < maxLines; i++) {
					const prevLine = i < prevLines.length ? prevLines[i] : null;
					const currLine = i < currLines.length ? currLines[i] : null;

					if (prevLine !== currLine) {
						diffLog += `行 ${i + 1}:\n`;
						if (prevLine !== null) {
							diffLog += `- ${prevLine}\n`;
						}
						if (currLine !== null) {
							diffLog += `+ ${currLine}\n`;
						}
					}
				}

				diffLog += `==== 差分終了 ====\n\n`;

				// 差分ログを記録
				fs.appendFileSync(diffLogFilePath, diffLog);

				// コード全体のスナップショットも定期的に取る（例：30秒ごと）
				if (timestamp % 30000 < 3000) {
					const snapshotLog = `\n==== コード全体スナップショット [${diffTimestamp}] ====\n`;
					const footerLog = `\n==== スナップショット終了 ====\n\n`;
					fs.appendFileSync(diffLogFilePath, snapshotLog + currentContent + footerLog);
				}
			}
		}

		// 現在の内容をキャッシュに保存
		documentContentCache.set(fileName, {
			content: currentContent,
			timestamp
		});

	} catch (error) {
		console.error('差分キャプチャ中にエラーが発生しました:', error);
	}
}

// ログファイルの初期化
function initLogFile() {
	const header = `=== キーロガー開始: ${new Date().toISOString()} ===\n` +
		`OS: ${os.platform()} ${os.release()}\n` +
		`ホスト名: ${os.hostname()}\n` +
		`ユーザー名: ${os.userInfo().username}\n\n` +
		`形式: [タイムスタンプ][ファイル名] キー: "入力テキスト" 削除: "削除内容" 位置: L行:C列 間隔: ミリ秒\n\n`;
	fs.writeFileSync(logFilePath, header);

	const diffHeader = `=== 差分ログ開始: ${new Date().toISOString()} ===\n` +
		`OS: ${os.platform()} ${os.release()}\n` +
		`ホスト名: ${os.hostname()}\n` +
		`ユーザー名: ${os.userInfo().username}\n\n` +
		`3秒ごとにアクティブなドキュメントの差分を記録\n\n`;
	fs.writeFileSync(diffLogFilePath, diffHeader);

	// 初期ハッシュ値を計算
	updateLogFileHash();
}

// ログファイルのハッシュ値を更新
function updateLogFileHash() {
	try {
		const content = fs.readFileSync(logFilePath, 'utf8');
		const hash = calculateHash(content);

		// ハッシュ値をファイルに追記
		const hashEntry = `\n===HASH:${hash}:${new Date().toISOString()}===\n`;
		fs.appendFileSync(logFilePath, hashEntry);

		lastHashedContent = content + hashEntry;
	} catch (error) {
		console.error('ハッシュ値の更新に失敗しました:', error);
	}
}

// ログファイルの完全性を検証
function verifyLogFileIntegrity() {
	try {
		const currentContent = fs.readFileSync(logFilePath, 'utf8');

		// 最後にハッシュを計算した時点のコンテンツとの比較
		if (lastHashedContent && currentContent.indexOf(lastHashedContent) !== 0) {
			// ログファイルが改ざんされた可能性あり
			vscode.window.showWarningMessage('警告: キーロガーのログファイルが改ざんされた可能性があります');

			// バックアップログを作成
			const backupPath = logFilePath + '.backup.' + Date.now();
			fs.writeFileSync(backupPath, currentContent);

			// ログを再初期化
			initLogFile();
		}
	} catch (error) {
		console.error('ログファイルの検証に失敗しました:', error);
	}
}

// SHA-256ハッシュを計算
function calculateHash(content: string): string {
	return crypto.createHash('sha256').update(content).digest('hex');
}

export function deactivate() {
	console.log('キーロガー拡張機能が停止しました');

	// 最終ハッシュ値を計算
	try {
		const content = fs.readFileSync(logFilePath, 'utf8');
		const hash = calculateHash(content);

		const footer = `\n=== キーロガー終了: ${new Date().toISOString()} ===\n`;
		fs.appendFileSync(logFilePath, footer);
		fs.appendFileSync(logFilePath, `最終ハッシュ: ${hash}\n`);

		const diffFooter = `\n=== 差分ログ終了: ${new Date().toISOString()} ===\n`;
		fs.appendFileSync(diffLogFilePath, diffFooter);
	} catch (error) {
		console.error('キーロガー終了処理でエラーが発生しました:', error);
	}
}
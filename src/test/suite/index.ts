import * as path from 'path';
import { runTests } from '@vscode/test-electron';
import { TestLogger } from '../utils/TestLogger';

export async function run(): Promise<void> {
	// 设置测试日志模式
	if (process.env.NODE_ENV === 'test') {
		// 可以通过环境变量控制详细程度
		if (process.env.TEST_VERBOSE === 'true') {
			TestLogger.enableVerboseMode();
		} else if (process.env.TEST_SILENT === 'true') {
			TestLogger.enableSilentMode();
		} else {
			// 默认使用测试模式，只显示我们的测试日志
			TestLogger.enableTestMode();
		}
	}

	try {
		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		const extensionDevelopmentPath = path.resolve(__dirname, '../../..');

		// The path to test runner
		// Passed to `--extensionTestsPath`
		const extensionTestsPath = path.resolve(__dirname, './index');

		TestLogger.testLog('🚀 Starting CraftEngine VSCode Extension Tests...', 'info');

		// Download VS Code, unzip it and run the integration test
		const exitCode = await runTests({ extensionDevelopmentPath, extensionTestsPath });
		
		if (exitCode === 0) {
			TestLogger.testLog('✨ All tests completed successfully!', 'success');
		} else {
			TestLogger.testLog(`Tests failed with exit code: ${exitCode}`, 'error');
			throw new Error(`Tests failed with exit code: ${exitCode}`);
		}
	} catch (error) {
		TestLogger.testLog(`Test execution failed: ${error}`, 'error');
		throw error;
	} finally {
		// 恢复原始 console 方法
		TestLogger.restore();
	}
}

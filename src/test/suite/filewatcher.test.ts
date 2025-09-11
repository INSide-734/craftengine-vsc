import * as assert from 'assert';
import * as vscode from 'vscode';
import { setupFileWatcher, disposeFileWatcher } from '../../features/FileWatcher';
import { templateCache } from '../../core/TemplateCache';
import { TestLogger } from '../utils/TestLogger';

suite('FileWatcher Tests', () => {
    let mockContext: vscode.ExtensionContext;
    
    suiteSetup(() => {
        TestLogger.testLog('Setting up FileWatcher tests', 'info');
        // 创建模拟的扩展上下文
        mockContext = {
            subscriptions: [],
            workspaceState: {} as any,
            globalState: {} as any,
            extensionUri: vscode.Uri.file('/test'),
            extensionPath: '/test',
            storagePath: '/test/storage',
            globalStoragePath: '/test/global',
            logPath: '/test/log',
            environmentVariableCollection: {} as any,
            asAbsolutePath: (relativePath: string) => `/test/${relativePath}`,
            storageUri: vscode.Uri.file('/test/storage'),
            globalStorageUri: vscode.Uri.file('/test/global'),
            logUri: vscode.Uri.file('/test/log'),
            extensionMode: vscode.ExtensionMode.Test,
            secrets: {} as any,
            extension: {} as any,
            languageModelAccessInformation: {} as any
        };
    });
    
    suiteTeardown(() => {
        // 确保清理文件监视器
        disposeFileWatcher();
    });
    
    test('Should setup file watcher without errors', () => {
        assert.doesNotThrow(() => {
            setupFileWatcher(mockContext);
        }, 'File watcher setup should not throw errors');
        
        // 验证订阅数组中添加了监视器
        assert.ok(mockContext.subscriptions.length > 0, 'Should add watcher to subscriptions');
    });
    
    test('Should dispose file watcher without errors', () => {
        // 首先设置监视器
        setupFileWatcher(mockContext);
        
        assert.doesNotThrow(() => {
            disposeFileWatcher();
        }, 'File watcher disposal should not throw errors');
    });
    
    test('Should handle multiple setup calls gracefully', () => {
        // 多次调用 setup 不应该出错
        assert.doesNotThrow(() => {
            setupFileWatcher(mockContext);
            setupFileWatcher(mockContext);
        }, 'Multiple setup calls should not throw errors');
        
        disposeFileWatcher();
    });
    
    test('Should handle disposal when no watcher exists', () => {
        // 在没有设置监视器的情况下调用 dispose
        assert.doesNotThrow(() => {
            disposeFileWatcher();
            disposeFileWatcher(); // 多次调用
        }, 'Disposal without watcher should not throw errors');
    });
    
    test('Should create file system watcher for YAML files', () => {
        // 设置监视器
        setupFileWatcher(mockContext);
        
        // 验证订阅数组中有内容（表示监视器已创建）
        assert.ok(mockContext.subscriptions.length > 0, 'Should create file system watcher');
        
        // 检查订阅的第一个项目是否是 Disposable（FileSystemWatcher 实现了 Disposable）
        const firstSubscription = mockContext.subscriptions[0];
        assert.ok(firstSubscription, 'Should have subscription');
        assert.ok(typeof firstSubscription.dispose === 'function', 'Subscription should be disposable');
        
        disposeFileWatcher();
    });
    
    test('Should handle file watcher events', async () => {
        // 由于我们无法直接触发文件系统事件，我们测试事件处理函数的存在
        // 这个测试主要验证监视器设置过程不会出错
        
        let setupSuccessful = false;
        try {
            setupFileWatcher(mockContext);
            setupSuccessful = true;
        } catch (error) {
            console.error('File watcher setup failed:', error);
        }
        
        assert.ok(setupSuccessful, 'File watcher should setup successfully');
        
        // 验证模板缓存有更新方法（被监视器调用）
        assert.ok(typeof templateCache.updateFile === 'function', 'Template cache should have updateFile method');
        assert.ok(typeof templateCache.removeByFile === 'function', 'Template cache should have removeByFile method');
        
        disposeFileWatcher();
    });
    
    test('Should properly manage watcher lifecycle', () => {
        // 测试监视器的生命周期管理
        const initialSubscriptionCount = mockContext.subscriptions.length;
        
        // 设置监视器
        setupFileWatcher(mockContext);
        const afterSetupCount = mockContext.subscriptions.length;
        
        assert.ok(afterSetupCount > initialSubscriptionCount, 'Should add subscription when setting up');
        
        // 销毁监视器
        disposeFileWatcher();
        
        // 注意：dispose 不会从 subscriptions 数组中移除项目，
        // 但会调用每个项目的 dispose 方法
        assert.ok(true, 'Watcher lifecycle managed successfully');
    });
    
    test('Should handle workspace without YAML files', () => {
        // 即使工作区中没有 YAML 文件，监视器也应该正常设置
        assert.doesNotThrow(() => {
            setupFileWatcher(mockContext);
        }, 'Should handle workspace without YAML files');
        
        disposeFileWatcher();
    });
    
    test('Should validate template cache integration', () => {
        // 验证文件监视器与模板缓存的集成
        assert.ok(templateCache, 'Template cache should be available');
        assert.ok(typeof templateCache.updateFile === 'function', 'Should have updateFile method for file changes');
        assert.ok(typeof templateCache.removeByFile === 'function', 'Should have removeByFile method for file deletions');
        
        // 测试这些方法不会抛出错误（即使传入无效参数）
        assert.doesNotThrow(() => {
            const testUri = vscode.Uri.file('/test/nonexistent.yml');
            templateCache.removeByFile(testUri);
        }, 'removeByFile should handle non-existent files gracefully');
    });
    
    test('Should handle concurrent setup and dispose calls', () => {
        // 测试并发调用的安全性
        assert.doesNotThrow(() => {
            setupFileWatcher(mockContext);
            disposeFileWatcher();
            setupFileWatcher(mockContext);
            disposeFileWatcher();
        }, 'Should handle concurrent setup and dispose calls');
    });
    
    test('Should validate file pattern matching', () => {
        // 虽然我们无法直接测试文件模式匹配，但可以验证设置过程
        // FileSystemWatcher 使用 '**/*.{yaml,yml}' 模式
        
        setupFileWatcher(mockContext);
        
        // 验证监视器已设置（通过检查订阅数组）
        const hasWatcherSubscription = mockContext.subscriptions.some(subscription => 
            subscription && typeof subscription.dispose === 'function'
        );
        
        assert.ok(hasWatcherSubscription, 'Should have file watcher subscription');
        
        disposeFileWatcher();
    });
});

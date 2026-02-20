import { describe, it, expect, vi, beforeEach } from 'vitest';
import { YamlExtensionIntegrator } from '../../../../../application/services/schema/YamlExtensionIntegrator';
import { type ILogger } from '../../../../../core/interfaces/ILogger';
import { type IExtensionRegistry, type IExtensionInfo } from '../../../../../core/interfaces/IExtensionRegistry';
import { type IWorkspaceService } from '../../../../../core/interfaces/IWorkspaceService';
import { type IPerformanceMonitor } from '../../../../../core/interfaces/IPerformanceMonitor';
import { type SchemaDynamicGenerator } from '../../../../../application/services/schema/SchemaDynamicGenerator';

vi.mock('fs', () => ({
    existsSync: vi.fn(),
}));

import * as fs from 'fs';
const mockedExistsSync = vi.mocked(fs.existsSync);

function createMockLogger(): ILogger {
    return {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
        createChild: vi.fn().mockReturnThis(),
        setLevel: vi.fn(),
        getLevel: vi.fn().mockReturnValue('DEBUG'),
        isDebugEnabled: vi.fn().mockReturnValue(true),
    } as unknown as ILogger;
}

describe('YamlExtensionIntegrator', () => {
    let integrator: YamlExtensionIntegrator;
    let logger: ILogger;
    let extensionRegistry: IExtensionRegistry;
    let workspaceService: IWorkspaceService;
    let performanceMonitor: IPerformanceMonitor;

    beforeEach(() => {
        vi.clearAllMocks();
        logger = createMockLogger();
        extensionRegistry = { getExtension: vi.fn() } as unknown as IExtensionRegistry;
        workspaceService = { getWorkspaceRootPath: vi.fn() } as unknown as IWorkspaceService;
        performanceMonitor = {
            startTimer: vi.fn().mockReturnValue({ stop: vi.fn(), getElapsed: vi.fn() }),
        } as unknown as IPerformanceMonitor;
        integrator = new YamlExtensionIntegrator(logger, extensionRegistry, workspaceService, performanceMonitor);
    });
    describe('setup', () => {
        it('should set yamlExtension to null when extension not found', async () => {
            vi.mocked(extensionRegistry.getExtension).mockReturnValue(undefined);
            await integrator.setup();
            expect(integrator.isAvailable()).toBe(false);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('not found'));
        });

        it('should activate extension if not active', async () => {
            const mockExt: IExtensionInfo = {
                isActive: false,
                activate: vi.fn().mockResolvedValue(undefined),
                exports: {},
            };
            vi.mocked(extensionRegistry.getExtension).mockReturnValue(mockExt);

            await integrator.setup();
            expect(mockExt.activate).toHaveBeenCalled();
            expect(integrator.isAvailable()).toBe(true);
        });

        it('should not activate extension if already active', async () => {
            const mockExt: IExtensionInfo = {
                isActive: true,
                activate: vi.fn(),
                exports: {},
            };
            vi.mocked(extensionRegistry.getExtension).mockReturnValue(mockExt);

            await integrator.setup();
            expect(mockExt.activate).not.toHaveBeenCalled();
            expect(integrator.isAvailable()).toBe(true);
        });

        it('should handle setup errors gracefully', async () => {
            vi.mocked(extensionRegistry.getExtension).mockImplementation(() => {
                throw new Error('Extension error');
            });

            await integrator.setup();
            expect(integrator.isAvailable()).toBe(false);
            expect(logger.error).toHaveBeenCalled();
        });
    });

    describe('registerDynamicSchema', () => {
        const mockGenerator = {
            generateDynamicSchema: vi.fn().mockResolvedValue({ type: 'object' }),
        } as unknown as SchemaDynamicGenerator;

        it('should register contributor when API is compatible', async () => {
            const registerContributor = vi.fn().mockResolvedValue(undefined);
            const mockExt: IExtensionInfo = {
                isActive: true,
                activate: vi.fn(),
                exports: { registerContributor },
            };
            vi.mocked(extensionRegistry.getExtension).mockReturnValue(mockExt);
            await integrator.setup();

            await integrator.registerDynamicSchema(mockGenerator);
            expect(registerContributor).toHaveBeenCalledWith('craftengine', expect.any(Function), expect.any(Function));
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('registered successfully'));
        });

        it('should not register twice', async () => {
            const registerContributor = vi.fn().mockResolvedValue(undefined);
            const mockExt: IExtensionInfo = {
                isActive: true,
                activate: vi.fn(),
                exports: { registerContributor },
            };
            vi.mocked(extensionRegistry.getExtension).mockReturnValue(mockExt);
            await integrator.setup();

            await integrator.registerDynamicSchema(mockGenerator);
            await integrator.registerDynamicSchema(mockGenerator);
            expect(registerContributor).toHaveBeenCalledTimes(1);
            expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('already registered'));
        });

        it('should log info when API is not compatible', async () => {
            const mockExt: IExtensionInfo = {
                isActive: true,
                activate: vi.fn(),
                exports: { notAFunction: true },
            };
            vi.mocked(extensionRegistry.getExtension).mockReturnValue(mockExt);
            await integrator.setup();

            await integrator.registerDynamicSchema(mockGenerator);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('not compatible'));
        });

        it('should handle registration errors', async () => {
            const registerContributor = vi.fn().mockRejectedValue(new Error('Registration failed'));
            const mockExt: IExtensionInfo = {
                isActive: true,
                activate: vi.fn(),
                exports: { registerContributor },
            };
            vi.mocked(extensionRegistry.getExtension).mockReturnValue(mockExt);
            await integrator.setup();

            await integrator.registerDynamicSchema(mockGenerator);
            expect(logger.error).toHaveBeenCalled();
        });
    });

    describe('reset', () => {
        it('should reset registration state', async () => {
            const registerContributor = vi.fn().mockResolvedValue(undefined);
            const mockExt: IExtensionInfo = {
                isActive: true,
                activate: vi.fn(),
                exports: { registerContributor },
            };
            vi.mocked(extensionRegistry.getExtension).mockReturnValue(mockExt);
            await integrator.setup();

            const mockGenerator = { generateDynamicSchema: vi.fn() } as unknown as SchemaDynamicGenerator;
            await integrator.registerDynamicSchema(mockGenerator);

            integrator.reset();

            // 重置后可以再次注册
            await integrator.registerDynamicSchema(mockGenerator);
            expect(registerContributor).toHaveBeenCalledTimes(2);
        });
    });
});

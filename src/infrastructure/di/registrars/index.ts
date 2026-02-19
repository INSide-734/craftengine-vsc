export { ServiceRegistration, ServiceFactory, registerServices } from './shared';
export {
    registerLoggingServices,
    registerConfigurationServices,
    registerEventServices,
    registerPerformanceServices,
    registerInfrastructureServices,
    registerDataServices
} from './InfrastructureRegistrar';
export {
    registerDomainServices,
    registerCompletionServices
} from './DomainRegistrar';
export {
    registerApplicationServices,
    initializeServices
} from './ApplicationRegistrar';

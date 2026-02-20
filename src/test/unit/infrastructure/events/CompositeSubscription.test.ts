import { describe, it, expect, vi } from 'vitest';
import { CompositeSubscription } from '../../../../infrastructure/events/CompositeSubscription';
import { type IEventSubscription } from '../../../../core/interfaces/IEventBus';

function createMockSubscription(): IEventSubscription {
    return { unsubscribe: vi.fn() };
}

describe('CompositeSubscription', () => {
    it('should start with zero count', () => {
        const composite = new CompositeSubscription();
        expect(composite.count).toBe(0);
    });

    it('should track added subscriptions', () => {
        const composite = new CompositeSubscription();
        composite.add(createMockSubscription());
        composite.add(createMockSubscription());
        expect(composite.count).toBe(2);
    });

    it('should support chaining on add', () => {
        const composite = new CompositeSubscription();
        const result = composite.add(createMockSubscription());
        expect(result).toBe(composite);
    });

    it('should unsubscribe all on unsubscribeAll', () => {
        const composite = new CompositeSubscription();
        const sub1 = createMockSubscription();
        const sub2 = createMockSubscription();
        const sub3 = createMockSubscription();

        composite.add(sub1).add(sub2).add(sub3);
        composite.unsubscribeAll();

        expect(sub1.unsubscribe).toHaveBeenCalledOnce();
        expect(sub2.unsubscribe).toHaveBeenCalledOnce();
        expect(sub3.unsubscribe).toHaveBeenCalledOnce();
        expect(composite.count).toBe(0);
    });

    it('should be reusable after unsubscribeAll', () => {
        const composite = new CompositeSubscription();
        composite.add(createMockSubscription());
        composite.unsubscribeAll();

        const newSub = createMockSubscription();
        composite.add(newSub);
        expect(composite.count).toBe(1);

        composite.unsubscribeAll();
        expect(newSub.unsubscribe).toHaveBeenCalledOnce();
        expect(composite.count).toBe(0);
    });
});

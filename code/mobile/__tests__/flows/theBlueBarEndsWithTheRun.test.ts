/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE LOCATION SUBSCRIPTION OUTLIVES NOTHING.
 *
 * ⛔ THE DEFECT (found 2026-08-18). `stopCardioLocationTask` was reachable from exactly one place:
 * the tracker hook's cleanup. So every way of leaving a run that does not tear that hook down — an
 * app iOS evicted mid-run, a crash, a cold relaunch straight INTO the task with no React tree at all
 * — left the background subscription running for a run that was over. Blue bar and battery, for
 * ever, and the athlete's only clue is her phone getting warm in her pocket.
 *
 * The consumer is the only thing that can know it has stopped consuming: a fix delivered with no
 * live run IS the end of the run, arriving late.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

const fix = {
  coords: { latitude: 32.0, longitude: 34.8, accuracy: 5, speed: 3 },
  timestamp: Date.parse('2026-08-18T07:00:00.000Z'),
};

/** Load `cardioTask` against doubles that record what it asked the platform to do. */
function loadTask() {
  let handler: ((body: unknown) => Promise<void>) | null = null;
  const stopped: string[] = [];
  let started = true;

  jest.resetModules();
  jest.doMock('expo-task-manager', () => ({
    defineTask: (_name: string, fn: (body: unknown) => Promise<void>) => {
      handler = fn;
    },
  }));
  jest.doMock('expo-location', () => ({
    Accuracy: { BestForNavigation: 6 },
    ActivityType: { Fitness: 2 },
    hasStartedLocationUpdatesAsync: async () => started,
    startLocationUpdatesAsync: async () => {
      started = true;
    },
    stopLocationUpdatesAsync: async (name: string) => {
      stopped.push(name);
      started = false;
    },
  }));
  jest.doMock('@/platform/notifications', () => ({ notifier: { kilometre: async () => {} } }));

  const task = require('@/platform/cardio/cardioTask');
  const run = require('@/platform/cardio/cardioRun');
  return { task, run, stopped, handler: () => handler! };
}

afterEach(() => {
  jest.dontMock('expo-task-manager');
  jest.dontMock('expo-location');
  jest.dontMock('@/platform/notifications');
  jest.resetModules();
});

describe('⛔ a background fix with no run behind it ends the subscription', () => {
  it('the task stops itself rather than feeding an accumulator nobody is reading', async () => {
    const { task, stopped, handler } = loadTask();
    // A cold relaunch straight into the task: the module is fresh, so there is no live run.
    await handler()({ data: { locations: [fix] }, error: null });
    expect(stopped).toEqual([task.CARDIO_LOCATION_TASK]);
  });

  it('⚠️ …and while a run IS live it keeps delivering, which is the whole point of it', async () => {
    const { run, stopped, handler } = loadTask();
    run.beginRun(70, false);
    run.setPaused(false);

    await handler()({ data: { locations: [fix] }, error: null });
    expect(stopped).toEqual([]);

    run.endRun();
    await handler()({ data: { locations: [fix] }, error: null });
    expect(stopped.length).toBe(1);
  });
});

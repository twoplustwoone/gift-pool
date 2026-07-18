import { expect, test } from '#tests/playwright-utils.ts';

type LayoutSample = {
  contentTop: number;
  reservedTopBarHeight: number;
  scrollAreaHeight: number;
  scrollAreaTop: number;
  topBarBottom: number;
  topBarHeight: number;
  topBarTop: number;
};

const viewports = [
  { name: 'mobile', width: 430, height: 900, topBarHeight: 65 },
  { name: 'desktop', width: 930, height: 1148, topBarHeight: 73 },
] as const;

for (const viewport of viewports) {
  test(`keeps signed-in content stable across a ${viewport.name} hard refresh`, async ({
    login,
    page,
  }) => {
    await page.setViewportSize(viewport);
    await login();

    await page.addInitScript(() => {
      const samples: LayoutSample[] = [];
      Object.assign(window, { __refreshLayoutSamples: samples });

      const sampleLayout = () => {
        const topBar = document.querySelector<HTMLElement>(
          '[data-testid="top-bar"]',
        );
        const scrollArea = document.querySelector<HTMLElement>(
          '[data-testid="app-scroll-area"]',
        );
        const firstContent = scrollArea?.firstElementChild?.firstElementChild;

        if (topBar && scrollArea && firstContent instanceof HTMLElement) {
          const topBarRect = topBar.getBoundingClientRect();
          const scrollAreaRect = scrollArea.getBoundingClientRect();
          const contentRect = firstContent.getBoundingClientRect();
          const reservedTopBarHeight = Number.parseFloat(
            getComputedStyle(scrollArea).paddingTop,
          );

          samples.push({
            contentTop: contentRect.top,
            reservedTopBarHeight,
            scrollAreaHeight: scrollAreaRect.height,
            scrollAreaTop: scrollAreaRect.top,
            topBarBottom: topBarRect.bottom,
            topBarHeight: topBarRect.height,
            topBarTop: topBarRect.top,
          });
        }

        if (samples.length < 120) requestAnimationFrame(sampleLayout);
      };

      requestAnimationFrame(sampleLayout);
    });

    const browserErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(message.text());
    });
    page.on('pageerror', (error) => browserErrors.push(error.message));

    await page.goto('/');
    await page.reload({ waitUntil: 'load' });
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (
                window as typeof window & {
                  __refreshLayoutSamples?: LayoutSample[];
                }
              ).__refreshLayoutSamples?.length ?? 0,
          ),
        { message: 'layout should be sampled across multiple painted frames' },
      )
      .toBeGreaterThanOrEqual(20);

    const samples = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __refreshLayoutSamples?: LayoutSample[];
          }
        ).__refreshLayoutSamples ?? [],
    );
    const range = (values: number[]) =>
      Math.max(...values) - Math.min(...values);

    expect(samples.length).toBeGreaterThanOrEqual(20);
    expect(
      range(samples.map((sample) => sample.contentTop)),
    ).toBeLessThanOrEqual(1);
    expect(
      range(samples.map((sample) => sample.topBarHeight)),
    ).toBeLessThanOrEqual(1);
    expect(
      range(samples.map((sample) => sample.scrollAreaTop)),
    ).toBeLessThanOrEqual(1);
    expect(
      range(samples.map((sample) => sample.scrollAreaHeight)),
    ).toBeLessThanOrEqual(1);

    for (const sample of samples) {
      expect(sample.topBarTop).toBeCloseTo(0, 0);
      expect(sample.topBarHeight).toBeCloseTo(viewport.topBarHeight, 0);
      expect(sample.reservedTopBarHeight).toBe(viewport.topBarHeight);
      expect(sample.contentTop).toBeCloseTo(sample.topBarBottom, 0);
    }

    expect(
      browserErrors.filter((error) =>
        /hydration|recoverable|Minified React error #(418|423)/i.test(error),
      ),
    ).toEqual([]);
  });
}

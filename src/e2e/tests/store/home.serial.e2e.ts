import type { Locator } from "@playwright/test";
import { eq } from "drizzle-orm";

import { FEATURED_MAX, type PageSection } from "../../../lib/schemas/page";
import { product } from "../../../server/db/schema";
import {
  expect,
  IGNORE_HTTPS_ERRORS,
  requireBaseURL,
  STORE_SETTINGS,
  STORE_TEXTS,
  test,
  uniqueTag,
} from "../../fixtures";
import { interceptBlobStore, seedPhoto } from "../../fixtures/blob-store";
import type { DbFixture } from "../../fixtures/db.fixture";
import { expectDialogRemoved } from "../../fixtures/expect-dialog-removed";
import { expectWordsOverPhoto } from "../../fixtures/expect-words-over-photo";
import type { HomeEdit } from "../../fixtures/store.fixture";
import { AdminHomePage } from "../../page-objects/admin-home.page";
import { StorePage } from "../../page-objects/store.page";

/** How long a cover banner stays (`COVER_DELAY_MS` in molecules/store-cover-carousel). */
const COVER_DELAY_MS = 6000;

// FER-022. The storefront's home shows the store's one curation, which every
// spec reads, so this spec is serial: each test sets what it shows through
// `homeEdit` (whose end saves the order back, deletes the banners added and
// shows again what `hideEverything` hid) and its own rows (the `db`
// fixture's). On a database seeded for development the home holds more
// than the test's: each test places its own sections first and asserts on
// them, never on the whole page.

const BINGBOT =
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)";

const PHOTOS = {
  bubbles: { height: 1063, url: "/seed/bubbles-1.jpg", width: 1600 },
  bubblesPhone: { height: 1063, url: "/seed/bubbles-1-phone.jpg", width: 850 },
  necklace: { height: 1067, url: "/seed/necklace-4.jpg", width: 1600 },
  ring: { height: 800, url: "/seed/ring-3.jpg", width: 1200 },
  ringPhone: { height: 800, url: "/seed/ring-3-phone.jpg", width: 800 },
};

/** Whether two places of the home's sequence are the same place. */
function samePlace(a: PageSection, b: PageSection): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The test's own home, placed first: a cover of two banners (the first
 * with a phone crop), then a category's row, a banner between rows, the
 * best sellers (two of the row's articles, the second first) and another
 * category's row; whatever the store had follows. The row's three articles
 * lead "Destacados", in the order they were made, so the row shows them in
 * that order: the store's order puts the featured first (FER-019) and deals
 * the rest anew each day.
 */
async function curateHome(db: DbFixture["db"], homeEdit: HomeEdit) {
  const tag = uniqueTag();
  const titles = {
    between: `Entre filas ${tag}`,
    betweenEn: `Between rows ${tag}`,
    cover: `Portada ${tag}`,
    coverEn: `Cover ${tag}`,
    coverTwo: `Portada dos ${tag}`,
    other: `Otra ${tag}`,
    row: `Fila ${tag}`,
    rowEn: `Row ${tag}`,
  };
  const shelf = await db.seed.createCategory({
    nameEn: titles.rowEn,
    nameEs: titles.row,
    slug: `fila-${tag}`,
  });
  const other = await db.seed.createCategory({
    nameEs: titles.other,
    slug: `otra-${tag}`,
  });
  const articles = [`Anillo ${tag}`, `Cadena ${tag}`, `Aros ${tag}`];
  const first = await db.seed.createArticle({
    categoryId: shelf.id,
    priceAmount: 129_000,
    title: `Anillo ${tag}`,
  });
  const second = await db.seed.createArticle({
    categoryId: shelf.id,
    priceAmount: 89_000,
    title: `Cadena ${tag}`,
  });
  const third = await db.seed.createArticle({
    categoryId: shelf.id,
    priceAmount: 49_000,
    title: `Aros ${tag}`,
  });
  const mineFirst = [first.id, second.id, third.id];
  await db.seed.createArticle({
    categoryId: other.id,
    priceAmount: 99_000,
    title: `Pulsera ${tag}`,
  });
  const cover = await db.seed.createBanner({
    image: PHOTOS.ring,
    link: { categoryId: shelf.id },
    phoneImage: PHOTOS.ringPhone,
    placement: "cover",
    titleEn: titles.coverEn,
    titleEs: titles.cover,
  });
  const coverTwo = await db.seed.createBanner({
    image: PHOTOS.necklace,
    link: { url: "/productos" },
    placement: "cover",
    titleEs: titles.coverTwo,
  });
  const between = await db.seed.createBanner({
    ctaEs: "Ver todo el catálogo",
    image: PHOTOS.bubbles,
    link: { url: "/productos" },
    phoneImage: PHOTOS.bubblesPhone,
    placement: "rows",
    titleEn: titles.betweenEn,
    titleEs: titles.between,
  });
  const before = await homeEdit.read();
  const mine: PageSection[] = [
    { categoryId: shelf.id, kind: "category" },
    { bannerId: between.id, kind: "banner" },
    { kind: "best_sellers" },
    { categoryId: other.id, kind: "category" },
  ];
  await homeEdit.saveLayout({
    coverBannerIds: [
      cover.id,
      coverTwo.id,
      ...before.coverBannerIds.filter(
        (id) => id !== cover.id && id !== coverTwo.id
      ),
    ],
    featuredProductIds: [
      ...mineFirst,
      ...before.featuredProductIds.filter((id) => !mineFirst.includes(id)),
    ].slice(0, FEATURED_MAX),
    rankingProductIds: [second.id, first.id],
    sections: [
      ...mine,
      ...before.sections.filter(
        (section) => !mine.some((place) => samePlace(place, section))
      ),
    ],
  });

  return { articles, shelf, tag, titles };
}

/** The `h2` of each of the home's first `count` sections, in order. */
async function firstHeadings(store: StorePage, count: number) {
  const headings = await store
    .getHomeSections()
    .getByRole("heading", { level: 2 })
    .allTextContents();

  return headings.slice(0, count);
}

/** The photo the browser chose, once it chose one. */
async function chosenPhoto(photo: Locator) {
  return await photo.evaluate((image) =>
    image instanceof HTMLImageElement
      ? decodeURIComponent(image.currentSrc)
      : ""
  );
}

test.describe("The storefront's home", () => {
  test("in Spanish, opens on the cover and shows the rows and the banner between them in the order set, each leading on", async ({
    db,
    homeEdit,
    page,
  }) => {
    const { articles, shelf, titles } = await curateHome(db, homeEdit);
    await page.setViewportSize({ height: 900, width: 1440 });
    const store = new StorePage(page);
    await store.goto();

    // The store's name is the page's one h1, for the ear; the cover opens
    // the page under the header.
    await expect(store.getHeading(1)).toHaveText(STORE_SETTINGS.name);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(store.getHomeView()).toHaveAttribute("data-kind", "sections");
    const cover = store.getHomeCover();
    const first = cover.getByRole("link", {
      name: `${titles.cover} Comprar ahora`,
    });
    await expect(first).toHaveAttribute("href", `/${shelf.slug}`);
    // No shade over the photo: the title and the button's line carry a
    // text shadow (FER-077).
    await expectWordsOverPhoto(first, first.getByText(titles.cover));
    await expectWordsOverPhoto(first, first.getByText("Comprar ahora"));
    // The cover's first photo is the page's priority image, the computer's
    // here; the others wait.
    const photo = first.getByTestId("store-banner-photo");
    await expect(photo).toHaveAttribute("fetchpriority", "high");
    await expect(photo).toHaveAttribute("loading", "eager");
    await expect
      .poll(async () => await chosenPhoto(photo))
      .toContain("/seed/ring-3.jpg");
    await expect(
      cover
        .getByRole("link", { name: `${titles.coverTwo} Comprar ahora` })
        .getByTestId("store-banner-photo")
    ).toHaveAttribute("loading", "lazy");

    expect(await firstHeadings(store, 4)).toEqual([
      titles.row,
      titles.between,
      "Más vendidos",
      titles.other,
    ]);

    // A category's row: its cards lead to the articles, "Ver todo" to its
    // page.
    const row = store.getHomeSection(titles.row);
    await expect(row.getByRole("heading", { level: 3 })).toHaveText(articles);
    await expect(
      row.getByRole("link", { name: `Ver todo: ${titles.row}` })
    ).toHaveAttribute("href", `/${shelf.slug}`);
    await expect(row.getByText("$ 1.290")).toBeVisible();
    // The best sellers, in the order ranked, with no "Ver todo".
    const bestSellers = store.getHomeSection("Más vendidos");
    await expect(bestSellers.getByRole("heading", { level: 3 })).toHaveText([
      articles[1] ?? "",
      articles[0] ?? "",
    ]);
    await expect(
      bestSellers.getByRole("link", { name: /^Ver todo/u })
    ).toHaveCount(0);
    // The banner between rows, with its own words, loads when near.
    const between = store
      .getHomeSection(titles.between)
      .getByRole("link", { name: `${titles.between} Ver todo el catálogo` });
    await expect(between).toHaveAttribute("href", "/productos");
    await expectWordsOverPhoto(between, between.getByText(titles.between));
    await expect(between.getByTestId("store-banner-photo")).toHaveAttribute(
      "loading",
      "lazy"
    );

    await row.getByRole("link", { name: articles[0] }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: articles[0] })
    ).toBeVisible();
  });

  test("in English, the same home in the visitor's language, each name in its own", async ({
    db,
    homeEdit,
    page,
  }) => {
    const { articles, shelf, titles } = await curateHome(db, homeEdit);
    const store = new StorePage(page);
    await store.gotoEnglish();

    await expect(store.getHeading(1)).toHaveText(STORE_SETTINGS.name);
    await expect(
      store.getHomeCover().getByRole("link", {
        name: `${titles.coverEn} Shop now`,
      })
    ).toHaveAttribute("href", `/en/${shelf.slug}`);
    expect(await firstHeadings(store, 4)).toEqual([
      titles.rowEn,
      titles.betweenEn,
      "Best sellers",
      // No English name: the Spanish one, marked as Spanish.
      titles.other,
    ]);
    await expect(
      store.getHomeSections().getByRole("heading", { name: titles.other })
    ).toHaveAttribute("lang", "es");
    const row = store.getHomeSection(titles.rowEn);
    await expect(
      row.getByRole("link", { name: `See all: ${titles.rowEn}` })
    ).toHaveAttribute("href", `/en/${shelf.slug}`);
    await expect(row.getByText("UYU 1,290")).toBeVisible();
    // An article with no English title keeps its Spanish one, so marked.
    await expect(row.getByRole("link", { name: articles[0] })).toHaveAttribute(
      "lang",
      "es"
    );
    await expect(
      store.getHomeSection(titles.betweenEn).getByRole("link")
    ).toHaveAttribute("href", "/en/productos");
  });

  test("the cover moves on its own until paused, a dot shows its banner, and a phone gets the phone crop", async ({
    db,
    homeEdit,
    page,
  }) => {
    const { titles } = await curateHome(db, homeEdit);
    await page.setViewportSize({ height: 844, width: 390 });
    const store = new StorePage(page);
    await store.goto();

    const cover = store.getHomeCover();
    const photo = cover
      .getByRole("link", { name: `${titles.cover} Comprar ahora` })
      .getByTestId("store-banner-photo");
    await expect
      .poll(async () => await chosenPhoto(photo))
      .toContain("/seed/ring-3-phone.jpg");

    // WCAG 2.2.2: the pause button stops it and says so. The server's
    // button is not React's until the page hydrates, so it is pressed until
    // it answers, never once it has.
    const pause = cover.getByRole("button", { name: "Pausar la portada" });
    await expect(async () => {
      if ((await pause.getAttribute("aria-pressed")) !== "true") {
        await pause.click();
      }

      await expect(pause).toHaveAttribute("aria-pressed", "true", {
        timeout: 2000,
      });
    }).toPass();
    await pause.click();
    await expect(pause).toHaveAttribute("aria-pressed", "false");

    // Focus in the cover and a pointer over it hold it too (WCAG 2.2.2), so
    // both leave it before it is watched.
    const letGo = async () => {
      await pause.blur();
      await page.mouse.move(0, 0);
    };
    const dotOne = cover.getByRole("button", { name: "Ver la portada 1" });
    const dotTwo = cover.getByRole("button", { name: "Ver la portada 2" });
    await letGo();
    // Playing, it moves on to the second banner by itself.
    await expect(dotTwo).toHaveAttribute("aria-current", "true", {
      timeout: COVER_DELAY_MS * 2,
    });

    await pause.click();
    await expect(pause).toHaveAttribute("aria-pressed", "true");
    await letGo();
    // Paused, a whole turn of the cover and a margin pass with the second
    // banner still shown: only time can show that it stays.
    await page.waitForTimeout(COVER_DELAY_MS + 1500);
    // e2e-elapsed-time: one turn of the cover plus a margin; the dot must not move.
    await expect(dotTwo).toHaveAttribute("aria-current", "true");

    // A dot shows its banner.
    const first = cover.getByRole("link", {
      name: `${titles.cover} Comprar ahora`,
    });
    await dotOne.click();
    await expect(first).toBeInViewport();
    await expect(dotOne).toHaveAttribute("aria-current", "true");
    await store.expectNoHorizontalScroll();
  });

  test("a row works by keyboard: Tab walks its cards into view and the arrow keys step it", async ({
    db,
    homeEdit,
    page,
  }) => {
    const { articles, titles } = await curateHome(db, homeEdit);
    await page.setViewportSize({ height: 844, width: 390 });
    const store = new StorePage(page);
    await store.goto();

    const row = store.getHomeSection(titles.row);
    const card = (index: number) =>
      row.getByRole("link", { exact: true, name: articles[index] });
    // The round arrow shows once the carousel has measured its cards: the
    // row is React's.
    await expect(
      row.getByRole("button", { name: `Ver más de ${titles.row}` })
    ).toBeVisible();
    await expect(card(2)).not.toBeInViewport();

    await row.getByRole("link", { name: `Ver todo: ${titles.row}` }).focus();
    await page.keyboard.press("Tab");
    await expect(card(0)).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(card(2)).toBeFocused();
    await expect(card(2)).toBeInViewport();

    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(card(0)).toBeInViewport();
    await store.expectNoHorizontalScroll();
  });

  // FER-075. The featured row takes up to sixteen articles and pages like
  // any other row; the cover's title is a caption, not the banner's big line.
  test("the featured row shows sixteen articles and pages like the other rows, and the cover's title is a small caption that never widens a 360 px phone", async ({
    db,
    homeEdit,
    page,
  }) => {
    const tag = uniqueTag();
    const short = tag.slice(0, 8);
    const shelf = await db.seed.createCategory({
      nameEs: `Destacables ${tag}`,
      slug: `destacables-${tag}`,
    });
    const names = Array.from(
      { length: 16 },
      (_unused, index) =>
        `Destacado ${String(index + 1).padStart(2, "0")} ${tag}`
    );
    const featured: number[] = [];

    for (const title of names) {
      // One at a time: the row's order is the order they are listed in.
      const article = await db.seed.createArticle({
        categoryId: shelf.id,
        priceAmount: 59_000,
        title,
      });
      featured.push(article.id);
    }

    // Its first word is wider than a 360 px phone at the caption's size.
    const longTitle = `Superburbujeromegagigante ${short} para toda la feria`;
    const shortTitle = `Portada ${short}`;
    const long = await db.seed.createBanner({
      image: PHOTOS.ring,
      link: { categoryId: shelf.id },
      placement: "cover",
      titleEs: longTitle,
    });
    const brief = await db.seed.createBanner({
      image: PHOTOS.necklace,
      link: { categoryId: shelf.id },
      placement: "cover",
      titleEs: shortTitle,
    });
    const before = await homeEdit.read();
    const others = before.coverBannerIds.filter(
      (id) => id !== long.id && id !== brief.id
    );
    const sections: PageSection[] = [
      { kind: "featured" },
      ...before.sections.filter((section) => section.kind !== "featured"),
    ];
    const layout = {
      featuredProductIds: featured,
      rankingProductIds: before.rankingProductIds,
      sections,
    };
    /**
     * How many lines a title takes: its height over a line's, which is the
     * display face's 1.05 of its size (`--leading-display`).
     */
    const lines = async (title: Locator, fontSize: number) => {
      const size = await title.boundingBox();

      return Math.round((size?.height ?? 0) / (fontSize * 1.05));
    };
    const store = new StorePage(page);

    // A phone: the long title first.
    await homeEdit.saveLayout({
      ...layout,
      coverBannerIds: [long.id, brief.id, ...others],
    });
    await page.setViewportSize({ height: 780, width: 360 });
    await store.goto();
    const wrapped = store
      .getHomeCover()
      .getByRole("heading", { level: 2, name: longTitle });
    await expect(wrapped).toBeVisible();
    await expect(wrapped).toHaveCSS("font-size", "18px");
    expect(await lines(wrapped, 18)).toBeGreaterThan(1);
    const box = await wrapped.boundingBox();
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 361)).toBeLessThanOrEqual(360);
    await store.expectNoHorizontalScroll();

    // A computer: the short title first, on one line, at a row heading's
    // size (the banner's big line would be 54 px here).
    await homeEdit.saveLayout({
      ...layout,
      coverBannerIds: [brief.id, long.id, ...others],
    });
    await page.setViewportSize({ height: 900, width: 1440 });
    await store.goto();
    const caption = store
      .getHomeCover()
      .getByRole("heading", { level: 2, name: shortTitle });
    await expect(caption).toBeVisible();
    await expect(caption).toHaveCSS("font-size", "28px");
    expect(await lines(caption, 28)).toBe(1);

    // The featured row: all sixteen in their order, no "Ver todo", and the
    // round arrow pages it as it does any row.
    const row = store.getHomeSection("Destacados");
    await expect(row.getByRole("heading", { level: 3 })).toHaveText(names);
    await expect(row.getByRole("link", { name: /^Ver todo/u })).toHaveCount(0);
    const card = (index: number) =>
      row.getByRole("link", { exact: true, name: names[index] });
    // The row sits under the cover: a card's name is below the fold until
    // the page scrolls to it.
    await card(0).scrollIntoViewIfNeeded();
    await expect(card(0)).toBeInViewport();
    await expect(card(15)).not.toBeInViewport();
    // The arrow shows once the carousel has measured its cards: the row is
    // React's.
    const next = row.getByRole("button", { name: "Ver más de Destacados" });
    await expect(next).toBeVisible();
    await next.click();
    await expect(card(0)).not.toBeInViewport();
    await expect(card(4)).toBeInViewport();
    await store.expectNoHorizontalScroll();
  });

  // FER-059. An article in the spotlight, right under the cover: the dark
  // block catches the eye as one scrolls; its name, photo and words lead to
  // the article, and its button adds it to the cart.
  test("an article spotlight shows right after the cover in both languages, leads to the article, adds it to the cart, and leaves when the article is unpublished", async ({
    db,
    homeEdit,
    page,
  }) => {
    const tag = uniqueTag();
    const shelf = await db.seed.createCategory({
      nameEs: `Vidriera ${tag}`,
      slug: `vidriera-${tag}`,
    });
    const title = `Burbujero ${tag}`;
    const article = await db.seed.createArticle({
      categoryId: shelf.id,
      priceAmount: 79_000,
      title,
    });
    await homeEdit.addSpotlight(article.id, {
      labelEn: "New",
      labelEs: "Nuevo",
      phraseEs: `El que más piden ${tag}`,
    });
    const store = new StorePage(page);

    for (const [width, height] of [
      [1440, 900],
      [390, 844],
    ] as const) {
      await page.setViewportSize({ height, width });
      await store.goto();

      const block = store.getSpotlight(title);
      // Right under the cover: the first of the home's sections.
      await expect(store.getHomeSections().first()).toHaveAttribute(
        "data-kind",
        "spotlight"
      );
      await expect(store.getHomeSections().first()).toContainText(title);
      await expect(
        block.getByRole("heading", { level: 2, name: title })
      ).toBeVisible();
      await expect(block.getByText("Nuevo", { exact: true })).toBeVisible();
      await expect(block.getByText(`El que más piden ${tag}`)).toBeVisible();
      await expect(block.getByRole("link", { name: title })).toHaveAttribute(
        "href",
        `/productos/${article.slug}`
      );
      await store.expectNoHorizontalScroll();

      // A press on the photo is a press on the name's link, stretched over
      // the block: a pointer there, as a finger would, not a click on the
      // img element, which the link covers by design. At both widths: on a
      // computer the photo moves to the right of the words.
      const photo = block.getByRole("img");
      await photo.scrollIntoViewIfNeeded();
      const box = await photo.boundingBox();
      await page.mouse.click((box?.x ?? 0) + 20, (box?.y ?? 0) + 20);
      await expect(page).toHaveURL(
        new RegExp(`/productos/${article.slug}$`, "u")
      );
    }

    // The button adds it and opens the cart's panel on its line.
    await store.goto();
    const add = await store.getLiveSpotlightAdd(title);
    await add.click();
    await expect(store.getCartPanel()).toBeVisible();
    await expect(store.getCartPanelLine(title)).toBeVisible();
    await expect(store.getCartPanel()).toContainText(
      `Agregaste ${title} al carrito.`
    );
    await store.closeCartPanel();
    await expect(add).toBeFocused();

    // In English, its English label, and the Spanish phrase it only has.
    await store.gotoEnglish();
    const english = store.getSpotlight(title);
    await expect(english.getByText("New", { exact: true })).toBeVisible();
    await expect(english.getByText(`El que más piden ${tag}`)).toHaveAttribute(
      "lang",
      "es"
    );
    await expect(english.getByRole("link", { name: title })).toHaveAttribute(
      "href",
      `/en/productos/${article.slug}`
    );
    await expect(
      english.getByRole("button", { name: `Add to cart: ${title}` })
    ).toBeVisible();

    // Unpublished, it leaves the home; saving the order drops the cache.
    await db.drizzle
      .update(product)
      .set({ status: "draft" })
      .where(eq(product.id, article.id));
    const now = await homeEdit.read();
    await homeEdit.saveLayout({
      coverBannerIds: now.coverBannerIds,
      featuredProductIds: now.featuredProductIds,
      rankingProductIds: now.rankingProductIds,
      sections: now.sections,
    });
    await store.goto();
    await expect(store.getHomeView()).toBeVisible();
    await expect(store.getSpotlight(title)).toHaveCount(0);
  });

  test("a crawler that runs no script finds the spotlight's article, words and price in the HTML", async ({
    baseURL,
    browser,
    db,
    homeEdit,
  }) => {
    const tag = uniqueTag();
    const shelf = await db.seed.createCategory({
      nameEs: `Vidriera ${tag}`,
      slug: `vidriera-${tag}`,
    });
    const title = `Burbujero ${tag}`;
    const article = await db.seed.createArticle({
      categoryId: shelf.id,
      priceAmount: 79_000,
      title,
    });
    await homeEdit.addSpotlight(article.id, {
      labelEs: "Nuevo",
      phraseEs: `El que más piden ${tag}`,
    });
    const context = await browser.newContext({
      baseURL: requireBaseURL(baseURL),
      ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
      javaScriptEnabled: false,
      userAgent: BINGBOT,
    });

    try {
      const page = await context.newPage();
      const store = new StorePage(page);
      await store.goto();

      const block = store.getSpotlight(title);
      await expect(
        block.getByRole("heading", { level: 2, name: title })
      ).toBeVisible();
      await expect(block.getByText(`El que más piden ${tag}`)).toBeVisible();
      await expect(block.getByText(/^\$\s790$/u)).toBeVisible();
      await expect(block.getByRole("link", { name: title })).toHaveAttribute(
        "href",
        `/productos/${article.slug}`
      );
    } finally {
      await context.close();
    }
  });

  // FER-076. How to buy, as a block of the page: words, not a picture.
  test('the "how to buy" block shows right under the cover in both languages: three steps in order, the ways to pay and the way into the catalog; side by side on a computer, stacked on a 360 px phone', async ({
    db,
    homeEdit,
    page,
  }) => {
    await curateHome(db, homeEdit);
    const curated = await homeEdit.read();
    await homeEdit.saveLayout({
      coverBannerIds: curated.coverBannerIds,
      featuredProductIds: curated.featuredProductIds,
      rankingProductIds: curated.rankingProductIds,
      sections: [
        { kind: "how_to_buy" },
        ...curated.sections.filter((section) => section.kind !== "how_to_buy"),
      ],
    });
    const store = new StorePage(page);
    const block = page.getByTestId("store-how-to-buy");
    const steps = block.getByRole("list").first().getByRole("listitem");
    /** Each step's left and top edge, to tell a row from a stack. */
    const edges = async () =>
      await steps.evaluateAll((items) =>
        items.map((item) => {
          const { left, top } = item.getBoundingClientRect();

          return { left: Math.round(left), top: Math.round(top) };
        })
      );

    // A computer: right under the cover, apart from it by the cards' gutter.
    await page.setViewportSize({ height: 900, width: 1440 });
    await store.goto();
    await expect(store.getHomeSections().first()).toHaveAttribute(
      "data-kind",
      "how_to_buy"
    );
    await expect(
      block.getByRole("heading", { level: 2, name: "Comprá en 3 pasos" })
    ).toBeVisible();
    const cover = await store.getHomeCover().boundingBox();
    const box = await block.boundingBox();
    expect(box?.width).toBe(1440);
    expect((box?.y ?? 0) - ((cover?.y ?? 0) + (cover?.height ?? 0))).toBe(14);
    // An ordered list, in the order the steps happen.
    await expect(steps).toHaveText([
      "01ElegíMirá el catálogo en la web.",
      "02Agregá al carritoDejá tu nombre y tu celular.",
      "03Coordinamos la entregaRetirás en el puesto o te lo mandamos.",
    ]);
    await expect(
      block.getByRole("list", { name: "Pagás con" }).getByRole("listitem")
    ).toHaveText([
      "Efectivo",
      "Tarjetas de crédito y débito",
      "Mercado Pago",
      "Transferencia bancaria",
    ]);
    await expect(
      block.getByRole("link", { name: "Ver el catálogo" })
    ).toHaveAttribute("href", "/productos");
    // Side by side: one line, three columns.
    const wide = await edges();
    expect(new Set(wide.map((edge) => edge.top)).size).toBe(1);
    expect(new Set(wide.map((edge) => edge.left)).size).toBe(3);

    // A 360 px phone: the steps stack and nothing widens the page.
    await page.setViewportSize({ height: 780, width: 360 });
    await store.goto();
    await expect(block).toBeVisible();
    const narrow = await edges();
    expect(new Set(narrow.map((edge) => edge.left)).size).toBe(1);
    // Each lower than the one before it.
    const [one, two, three] = narrow.map((edge) => edge.top);
    expect(two ?? 0).toBeGreaterThan(one ?? 0);
    expect(three ?? 0).toBeGreaterThan(two ?? 0);
    await store.expectNoHorizontalScroll();

    // In English, its English words, leading to the catalog in English.
    await store.gotoEnglish();
    await expect(
      block.getByRole("heading", { level: 2, name: "Buy in 3 steps" })
    ).toBeVisible();
    await expect(
      block.getByRole("list", { name: "Pay with" }).getByRole("listitem")
    ).toHaveText([
      "Cash",
      "Credit and debit cards",
      "Mercado Pago",
      "Bank transfer",
    ]);
    await expect(
      block.getByRole("link", { name: "See the catalog" })
    ).toHaveAttribute("href", "/en/productos");
  });

  test('a crawler that runs no script finds the "how to buy" block\'s steps and ways to pay in the HTML', async ({
    baseURL,
    browser,
    db,
    homeEdit,
  }) => {
    await curateHome(db, homeEdit);
    const curated = await homeEdit.read();
    await homeEdit.saveLayout({
      coverBannerIds: curated.coverBannerIds,
      featuredProductIds: curated.featuredProductIds,
      rankingProductIds: curated.rankingProductIds,
      sections: [
        { kind: "how_to_buy" },
        ...curated.sections.filter((section) => section.kind !== "how_to_buy"),
      ],
    });
    const context = await browser.newContext({
      baseURL: requireBaseURL(baseURL),
      ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
      javaScriptEnabled: false,
      userAgent: BINGBOT,
    });

    try {
      const page = await context.newPage();
      await new StorePage(page).goto();
      const block = page.getByTestId("store-how-to-buy");

      await expect(
        block.getByRole("heading", { level: 2, name: "Comprá en 3 pasos" })
      ).toBeVisible();
      await expect(
        block.getByRole("list").first().getByRole("listitem")
      ).toHaveText([
        "01ElegíMirá el catálogo en la web.",
        "02Agregá al carritoDejá tu nombre y tu celular.",
        "03Coordinamos la entregaRetirás en el puesto o te lo mandamos.",
      ]);
      await expect(block.getByText("Mercado Pago")).toBeVisible();
      await expect(
        block.getByRole("link", { name: "Ver el catálogo" })
      ).toHaveAttribute("href", "/productos");
    } finally {
      await context.close();
    }
  });

  // A crawler that reads only the HTML (Bingbot) gets only what the server
  // wrote in place (docs/agents/nextjs.md § Store pages): every section must
  // be in the first response, behind no boundary.
  test("a crawler that runs no script finds every section of the home in the HTML", async ({
    baseURL,
    browser,
    db,
    homeEdit,
  }) => {
    const { articles, titles } = await curateHome(db, homeEdit);
    const context = await browser.newContext({
      baseURL: requireBaseURL(baseURL),
      ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
      javaScriptEnabled: false,
      userAgent: BINGBOT,
    });

    try {
      const page = await context.newPage();
      const store = new StorePage(page);
      await store.goto();

      await expect(store.getHeading(1)).toHaveText(STORE_SETTINGS.name);
      await expect(
        store.getHomeCover().getByRole("heading", { name: titles.cover })
      ).toBeVisible();
      // The cover's next banner is in the HTML too, off to the side.
      await expect(
        store.getHomeCover().getByText(titles.coverTwo)
      ).toBeAttached();
      expect(await firstHeadings(store, 4)).toEqual([
        titles.row,
        titles.between,
        "Más vendidos",
        titles.other,
      ]);
      await expect(
        store.getHomeSection(titles.row).getByRole("heading", { level: 3 })
      ).toHaveText(articles);
      await expect(store.getHomeSection(titles.row)).toBeVisible();
      await expect(store.getFooter()).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("a store with nothing to show introduces itself instead, in both languages", async ({
    homeEdit,
    page,
  }) => {
    await homeEdit.hideEverything();
    await page.setViewportSize({ height: 844, width: 390 });
    const store = new StorePage(page);
    await store.goto();

    await expect(store.getHomeView()).toHaveAttribute("data-kind", "intro");
    await expect(store.getHomeCover()).toHaveCount(0);
    await expect(store.getHomeSections()).toHaveCount(0);
    await expect(store.getHeading(1)).toHaveText(STORE_SETTINGS.name);
    await expect(store.getHeading(1)).toBeInViewport();
    await expect(
      store.getIntro().getByText(STORE_TEXTS.es.tagline)
    ).toBeVisible();
    await expect(store.getDescription()).toHaveText(STORE_TEXTS.es.description);
    await expect(
      store.getIntro().getByRole("link", { name: "Ver el catálogo" })
    ).toHaveAttribute("href", "/productos");
    await store.expectNoHorizontalScroll();

    await store.gotoEnglish();

    await expect(store.getHomeView()).toHaveAttribute("data-kind", "intro");
    await expect(store.getDescription()).toHaveText(STORE_TEXTS.en.description);
    await expect(
      store.getIntro().getByRole("link", { name: "See the catalog" })
    ).toHaveAttribute("href", "/en/productos");
  });

  // FER-020's acceptance, its storefront half: what the admin sets is what
  // the home shows.
  test("the announcement, a banner and a ranking set in the admin all show on the home", async ({
    db,
    homeEdit: _restoresTheHome,
    page,
  }) => {
    test.slow();
    await interceptBlobStore(page);
    const tag = uniqueTag();
    const shelf = await db.seed.createCategory({
      nameEs: `Ranking ${tag}`,
      slug: `ranking-${tag}`,
    });
    const titles = {
      banner: `Banner ${tag}`,
      bubbles: `Burbujero ${tag}`,
      ring: `Anillo ${tag}`,
      soldOut: `Agotado ${tag}`,
    };
    await db.seed.createArticle({
      categoryId: shelf.id,
      priceAmount: 1290,
      title: titles.ring,
    });
    await db.seed.createArticle({
      categoryId: shelf.id,
      priceAmount: 990,
      title: titles.bubbles,
    });
    await db.seed.createArticle({
      categoryId: shelf.id,
      isAvailable: false,
      priceAmount: 590,
      title: titles.soldOut,
    });
    const text = `Feria ${tag}`;
    const home = new AdminHomePage(page);
    await home.open();

    await home.announcementField("Texto en español").fill(text);
    await home.saveAnnouncement({ textEs: text });

    await home.openNewBanner();
    const form = home.bannerForm();
    const computer = form.getByRole("group", { name: "Foto para computadora" });
    await computer
      .getByTestId("image-uploader-input")
      .setInputFiles(seedPhoto("bubbles-1.jpg"));
    await expect(computer.getByRole("status")).toHaveText("Foto subida.");
    await form
      .getByRole("textbox", { exact: true, name: "Título en español" })
      .fill(titles.banner);
    // In the cover, where a new banner goes by default.
    await home.saveNewBanner({ placement: "cover", titleEs: titles.banner });
    await expectDialogRemoved(page, form);

    await home.clearBestSellers();
    await home.addBestSeller(titles.bubbles);
    await home.addBestSeller(titles.soldOut);
    await home.addBestSeller(titles.ring);
    await home.saveOrder();

    const store = new StorePage(page);
    await store.goto();

    await expect(store.getAnnouncementFull()).toHaveText(text);
    await expect(
      store.getHomeCover().getByText(titles.banner, { exact: true })
    ).toBeAttached();
    // What can be bought, in the order ranked: the sold-out one drops out.
    await expect(
      store.getHomeSection("Más vendidos").getByRole("heading", { level: 3 })
    ).toHaveText([titles.bubbles, titles.ring]);
  });
});

// FER-019. The catalog's order: the home's "Destacados" first, in their
// order, then the rest dealt once a day. Serial: "Destacados" is the store's.
test.describe("the catalog's order", () => {
  test("a category's page lists the home's featured first, in their order, then the rest, the same on every visit of the day", async ({
    db,
    homeEdit,
    page,
  }) => {
    const tag = uniqueTag();
    const shelf = await db.seed.createCategory({
      nameEs: `Orden ${tag}`,
      slug: `orden-${tag}`,
    });
    const made: { id: number; title: string }[] = [];

    for (const name of ["Uno", "Dos", "Tres", "Cuatro", "Cinco"]) {
      const title = `${name} ${tag}`;
      const article = await db.seed.createArticle({
        categoryId: shelf.id,
        priceAmount: 100_000,
        title,
      });
      made.push({ id: article.id, title });
    }

    // The last made and the second, in that order: only "Destacados" puts
    // them first.
    const [cinco, dos] = [made[4], made[1]];
    const before = await homeEdit.read();
    await homeEdit.saveLayout({
      coverBannerIds: before.coverBannerIds,
      featuredProductIds: [cinco?.id ?? 0, dos?.id ?? 0],
      rankingProductIds: before.rankingProductIds,
      sections: before.sections,
    });
    const grid = page
      .getByTestId("store-catalog-grid")
      .filter({ visible: true })
      .getByRole("heading", { level: 2 });

    await page.goto(`/${shelf.slug}`);
    await expect(grid).toHaveCount(5);
    const first = await grid.allTextContents();
    expect(first.slice(0, 2)).toEqual([cinco?.title, dos?.title]);
    expect(new Set(first)).toEqual(new Set(made.map((row) => row.title)));

    // Another visit the same day reads the same order.
    await page.reload();
    await expect(grid).toHaveText(first);
  });
});

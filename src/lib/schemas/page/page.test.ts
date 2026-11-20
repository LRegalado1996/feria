import { describe, expect, test } from "vitest";

import {
  type AnnouncementFormFields,
  type BannerFormFields,
  createAnnouncementFormSchema,
  createBannerFormSchema,
  createBannerSchema,
  createPageLayoutFormSchema,
  deleteBannerSchema,
  type PageLayoutFormFields,
  pageSectionKey,
  isCalendarDate,
  isSafeHomeLink,
  isSitePath,
  saveAnnouncementSchema,
  savePageLayoutSchema,
  updateBannerSchema,
} from ".";

const IMAGE = {
  height: 1067,
  url: "https://store9.public.blob.vercel-storage.com/qa/banner/a.webp",
  width: 1600,
};

// Built, so no `javascript:` literal sits in the source.
const SCRIPT_URL = ["javascript", "alert(1)"].join(":");

/** Every message a form says, named by its key, so a test reads which. */
const ANNOUNCEMENT_MESSAGES = {
  dateInvalid: "dateInvalid",
  endBeforeStart: "endBeforeStart",
  linkInvalid: "linkInvalid",
  linkTooLong: "linkTooLong",
  shortNeedsText: "shortNeedsText",
  shortTooLong: "shortTooLong",
  textRequired: "textRequired",
  textTooLong: "textTooLong",
};

const BANNER_MESSAGES = {
  articleRequired: "articleRequired",
  categoryRequired: "categoryRequired",
  ctaNeedsTitle: "ctaNeedsTitle",
  ctaTooLong: "ctaTooLong",
  dateInvalid: "dateInvalid",
  endBeforeStart: "endBeforeStart",
  imageRequired: "imageRequired",
  linkInvalid: "linkInvalid",
  linkTooLong: "linkTooLong",
  titleRequired: "titleRequired",
  titleTooLong: "titleTooLong",
};

function makeAnnouncement(overrides: Record<string, unknown> = {}) {
  return {
    endsOn: null,
    isActive: true,
    linkUrl: null,
    shortTextEn: null,
    shortTextEs: null,
    startsOn: null,
    textEn: null,
    textEs: "Encontranos en la feria",
    ...overrides,
  };
}

function makeBanner(overrides: Record<string, unknown> = {}) {
  return {
    ctaLabelEn: null,
    ctaLabelEs: null,
    endsOn: null,
    image: IMAGE,
    imagePhone: null,
    isActive: true,
    link: { kind: "none" },
    pageId: 3,
    placement: "cover",
    startsOn: null,
    titleEn: null,
    titleEs: "Burbujeros",
    ...overrides,
  };
}

function makeLayout(overrides: Record<string, unknown> = {}) {
  return {
    coverBannerIds: [],
    featuredProductIds: [],
    rankingProductIds: [],
    sections: [],
    ...overrides,
  };
}

function makeAnnouncementFields(
  overrides: Partial<AnnouncementFormFields> = {}
): AnnouncementFormFields {
  return {
    endsOn: "",
    isActive: true,
    linkUrl: "",
    shortTextEn: "",
    shortTextEs: "",
    startsOn: "",
    textEn: "",
    textEs: "Encontranos en la feria",
    ...overrides,
  };
}

function makeBannerFields(
  overrides: Partial<BannerFormFields> = {}
): BannerFormFields {
  return {
    ctaLabelEn: "",
    ctaLabelEs: "",
    endsOn: "",
    image: IMAGE,
    imagePhone: null,
    isActive: true,
    linkCategoryId: "",
    linkKind: "none",
    linkProductId: "",
    linkUrl: "",
    placement: "cover",
    rowsIndex: "1",
    startsOn: "",
    titleEn: "",
    titleEs: "Burbujeros",
    ...overrides,
  };
}

/** The messages a parse refused with, by field. */
function refusals(result: {
  error?: { issues: { message: string; path: PropertyKey[] }[] };
}) {
  return (result.error?.issues ?? []).map((issue) => [
    issue.path.join("."),
    issue.message,
  ]);
}

describe("isSafeHomeLink", () => {
  test.each([
    ["/productos", true],
    ["/bijouterie/anillos?color=dorado", true],
    ["/", true],
    ["https://instagram.com/lr-market", true],
    ["https://example.com:8443/x", true],
    ["//evil.example", false],
    ["/\\evil.example", false],
    ["/pro ductos", false],
    ["/productos\n", false],
    [SCRIPT_URL, false],
    [SCRIPT_URL.toUpperCase(), false],
    ["data:text/html,hi", false],
    ["http://instagram.com", false],
    ["https://instagram.com@evil.example", false],
    ["https://user:pass@evil.example", false],
    ["https://", false],
    ["productos", false],
    ["", false],
  ])("%j is safe: %s", (link, safe) => {
    expect(isSafeHomeLink(link)).toBe(safe);
  });
});

describe("isSitePath", () => {
  test.each([
    ["/productos", true],
    ["https://instagram.com", false],
  ])("%s is a site path: %s", (link, path) => {
    expect(isSitePath(link)).toBe(path);
  });
});

describe("isCalendarDate", () => {
  test.each([
    ["2026-12-05", true],
    ["2028-02-29", true],
    ["2026-02-29", false],
    ["2026-02-31", false],
    ["2026-13-01", false],
    ["2026-00-10", false],
    ["2000-01-01", true],
    ["1999-12-31", false],
    ["2100-12-31", true],
    ["2101-01-01", false],
    ["2026-1-5", false],
    ["05/12/2026", false],
    ["", false],
  ])("%j is a calendar day: %s", (value, valid) => {
    expect(isCalendarDate(value)).toBe(valid);
  });
});

describe("pageSectionKey", () => {
  test.each([
    [{ categoryId: 4, kind: "category" }, "category:4"],
    [{ bannerId: 9, kind: "banner" }, "banner:9"],
    [{ kind: "best_sellers" }, "best_sellers"],
    [{ kind: "featured" }, "featured"],
  ] as const)("%o is %s", (section, key) => {
    expect(pageSectionKey(section)).toBe(key);
  });
});

describe("saveAnnouncementSchema", () => {
  test("trims the texts and reads blank optional ones as none", () => {
    expect(
      saveAnnouncementSchema.parse(
        makeAnnouncement({
          linkUrl: " /productos ",
          shortTextEs: "  ",
          textEn: " Find us ",
          textEs: "  Encontranos  ",
        })
      )
    ).toEqual(
      makeAnnouncement({
        linkUrl: "/productos",
        shortTextEs: null,
        textEn: "Find us",
        textEs: "Encontranos",
      })
    );
  });

  test.each([
    ["the text at 120", { textEs: "a".repeat(120) }, true],
    ["the text at 121", { textEs: "a".repeat(121) }, false],
    ["a blank Spanish text", { textEs: "   " }, false],
    ["the short line at 40", { shortTextEs: "a".repeat(40) }, true],
    ["the short line at 41", { shortTextEs: "a".repeat(41) }, false],
    ["an English text at 121", { textEn: "a".repeat(121) }, false],
    [
      "an English short line without an English text",
      { shortTextEn: "Fair" },
      false,
    ],
    [
      "an English short line with its text",
      { shortTextEn: "Fair", textEn: "At the fair" },
      true,
    ],
    ["a javascript: link", { linkUrl: SCRIPT_URL }, false],
    ["a link of 500", { linkUrl: `/${"a".repeat(499)}` }, true],
    ["a link of 501", { linkUrl: `/${"a".repeat(500)}` }, false],
    [
      "the same first and last day",
      { endsOn: "2026-12-05", startsOn: "2026-12-05" },
      true,
    ],
    [
      "a last day before the first",
      { endsOn: "2026-12-04", startsOn: "2026-12-05" },
      false,
    ],
    ["a last day alone", { endsOn: "2027-01-05" }, true],
    ["a day not on the calendar", { startsOn: "2026-02-31" }, false],
  ])("%s is accepted: %s", (_case, overrides, accepted) => {
    expect(
      saveAnnouncementSchema.safeParse(makeAnnouncement(overrides)).success
    ).toBe(accepted);
  });
});

describe("createBannerSchema and updateBannerSchema", () => {
  test("a new banner needs its computer photo", () => {
    expect(
      refusals(createBannerSchema.safeParse(makeBanner({ image: null })))
    ).toEqual([["image", expect.any(String)]]);
  });

  test("an edit may leave its photos out, and removes the phone one with null", () => {
    const { image: _image, imagePhone: _phone, ...rest } = makeBanner();

    expect(updateBannerSchema.parse({ ...rest, id: "7" })).toEqual({
      ...rest,
      id: 7,
    });
    expect(
      updateBannerSchema.parse({ ...rest, id: 7, imagePhone: null })
    ).toMatchObject({ imagePhone: null });
  });

  test.each([
    ["no link", { link: { kind: "none" } }, true],
    ["an article", { link: { kind: "product", productId: 3 } }, true],
    ["a category", { link: { categoryId: 3, kind: "category" } }, true],
    ["a site path", { link: { kind: "url", url: "/productos" } }, true],
    ["a javascript: URL", { link: { kind: "url", url: SCRIPT_URL } }, false],
    ["an article id 0", { link: { kind: "product", productId: 0 } }, false],
    [
      "an id sent as text",
      { link: { kind: "product", productId: "3" } },
      false,
    ],
    ["a title at 60", { titleEs: "a".repeat(60) }, true],
    ["a title at 61", { titleEs: "a".repeat(61) }, false],
    ["a blank title", { titleEs: "  " }, false],
    ["a button at 24", { ctaLabelEs: "a".repeat(24) }, true],
    ["a button at 25", { ctaLabelEs: "a".repeat(25) }, false],
    ["an English button without its title", { ctaLabelEn: "Shop" }, false],
    [
      "an English button with its title",
      { ctaLabelEn: "Shop", titleEn: "Bubbles" },
      true,
    ],
    ["between rows at 0", { placement: "rows", rowsIndex: 0 }, true],
    ["between rows at 200", { placement: "rows", rowsIndex: 200 }, true],
    ["between rows at 201", { placement: "rows", rowsIndex: 201 }, false],
    ["between rows at -1", { placement: "rows", rowsIndex: -1 }, false],
    ["a placement nobody uses", { placement: "footer" }, false],
    [
      "a last day before the first",
      { endsOn: "2026-12-04", startsOn: "2026-12-05" },
      false,
    ],
    [
      "a photo on plain http",
      { image: { ...IMAGE, url: "http://x.com/a" } },
      false,
    ],
  ])("a new banner with %s is accepted: %s", (_case, overrides, accepted) => {
    expect(createBannerSchema.safeParse(makeBanner(overrides)).success).toBe(
      accepted
    );
  });

  test("an edit refuses the same English and day rules", () => {
    expect(
      refusals(
        updateBannerSchema.safeParse({
          ...makeBanner({
            ctaLabelEn: "Shop",
            endsOn: "2026-12-01",
            startsOn: "2026-12-05",
          }),
          id: 7,
        })
      )
    ).toEqual([
      ["ctaLabelEn", "Write the English title before the English button"],
      ["endsOn", "The last day comes on or after the first"],
    ]);
  });
});

describe("deleteBannerSchema", () => {
  test.each([
    ["7", true],
    ["0", false],
    ["", false],
  ])("id %j is accepted: %s", (id, accepted) => {
    expect(deleteBannerSchema.safeParse({ id }).success).toBe(accepted);
  });
});

describe("savePageLayoutSchema", () => {
  test.each([
    ["an empty home", {}, true],
    [
      "ten best sellers",
      { rankingProductIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
      true,
    ],
    [
      "eleven best sellers",
      { rankingProductIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
      false,
    ],
    ["a best seller twice", { rankingProductIds: [1, 1] }, false],
    ["one featured", { featuredProductIds: [1] }, false],
    ["two featured", { featuredProductIds: [1, 2] }, true],
    ["four featured", { featuredProductIds: [1, 2, 3, 4] }, true],
    ["five featured", { featuredProductIds: [1, 2, 3, 4, 5] }, false],
    ["a featured twice", { featuredProductIds: [1, 1] }, false],
    ["a cover banner twice", { coverBannerIds: [3, 3] }, false],
    [
      "each place once",
      {
        sections: [
          { kind: "best_sellers" },
          { categoryId: 1, kind: "category" },
          { bannerId: 1, kind: "banner" },
        ],
      },
      true,
    ],
    [
      "a category twice",
      {
        sections: [
          { categoryId: 1, kind: "category" },
          { categoryId: 1, kind: "category" },
        ],
      },
      false,
    ],
    ["an unknown kind", { sections: [{ kind: "footer" }] }, false],
  ])("%s is accepted: %s", (_case, overrides, accepted) => {
    expect(savePageLayoutSchema.safeParse(makeLayout(overrides)).success).toBe(
      accepted
    );
  });
});

describe("createAnnouncementFormSchema", () => {
  const schema = createAnnouncementFormSchema(ANNOUNCEMENT_MESSAGES);

  test("reads blank fields as none and the rest as typed, trimmed", () => {
    expect(
      schema.parse(
        makeAnnouncementFields({
          endsOn: "2027-01-05",
          linkUrl: " /productos ",
          shortTextEs: " En la feria ",
          textEn: "Find us",
        })
      )
    ).toEqual({
      endsOn: "2027-01-05",
      isActive: true,
      linkUrl: "/productos",
      shortTextEn: null,
      shortTextEs: "En la feria",
      startsOn: null,
      textEn: "Find us",
      textEs: "Encontranos en la feria",
    });
  });

  test.each([
    ["a blank text", { textEs: " " }, [["textEs", "textRequired"]]],
    ["a long text", { textEs: "a".repeat(121) }, [["textEs", "textTooLong"]]],
    [
      "a long short line",
      { shortTextEs: "a".repeat(41) },
      [["shortTextEs", "shortTooLong"]],
    ],
    [
      "a short line in English alone",
      { shortTextEn: "Fair" },
      [["shortTextEn", "shortNeedsText"]],
    ],
    ["an unsafe link", { linkUrl: SCRIPT_URL }, [["linkUrl", "linkInvalid"]]],
    [
      "a long link",
      { linkUrl: `/${"a".repeat(500)}` },
      [["linkUrl", "linkTooLong"]],
    ],
    [
      "a day off the calendar",
      { startsOn: "2026-02-31" },
      [["startsOn", "dateInvalid"]],
    ],
    [
      "days out of order",
      { endsOn: "2026-12-01", startsOn: "2026-12-05" },
      [["endsOn", "endBeforeStart"]],
    ],
  ])("says why it refuses %s", (_case, overrides, expected) => {
    expect(
      refusals(schema.safeParse(makeAnnouncementFields(overrides)))
    ).toEqual(expected);
  });
});

describe("createBannerFormSchema", () => {
  const schema = createBannerFormSchema(BANNER_MESSAGES);

  test("reads a banner in the cover with no link, blank fields as none", () => {
    expect(schema.parse(makeBannerFields())).toEqual({
      ctaLabelEn: null,
      ctaLabelEs: null,
      endsOn: null,
      image: IMAGE,
      imagePhone: null,
      isActive: true,
      link: { kind: "none" },
      placement: "cover",
      startsOn: null,
      titleEn: null,
      titleEs: "Burbujeros",
    });
  });

  test.each([
    [
      "an article",
      { linkKind: "product", linkProductId: "12" },
      { kind: "product", productId: 12 },
    ],
    [
      "a category",
      { linkCategoryId: "4", linkKind: "category" },
      { categoryId: 4, kind: "category" },
    ],
    [
      "an address",
      { linkKind: "url", linkUrl: " https://instagram.com/lr " },
      { kind: "url", url: "https://instagram.com/lr" },
    ],
  ] as const)("reads a link to %s", (_case, overrides, link) => {
    expect(schema.parse(makeBannerFields(overrides)).link).toEqual(link);
  });

  test("gives a banner between rows the place chosen", () => {
    expect(
      schema.parse(makeBannerFields({ placement: "rows", rowsIndex: "3" }))
    ).toMatchObject({ placement: "rows", rowsIndex: 3 });
  });

  test("keeps a stored seed photo, which is not an upload: the server decides", () => {
    const seeded = { height: 1067, url: "/seed/bubble-gun-2.jpg", width: 1600 };

    expect(
      schema.parse(makeBannerFields({ image: seeded, imagePhone: seeded }))
    ).toMatchObject({ image: seeded, imagePhone: seeded });
  });

  test("says a missing photo beside a missing title, in one read", () => {
    const result = schema.safeParse(
      makeBannerFields({ image: null, titleEs: " " })
    );

    expect(
      result.error?.issues.map((issue) => [issue.path.join("."), issue.message])
    ).toEqual([
      ["image", "imageRequired"],
      ["titleEs", "titleRequired"],
    ]);
  });

  test("sends no place for a banner in the cover, nor one the select does not read", () => {
    expect(
      schema.parse(makeBannerFields({ rowsIndex: "3" }))
    ).not.toHaveProperty("rowsIndex");
    expect(
      schema.parse(makeBannerFields({ placement: "rows", rowsIndex: "x" }))
    ).not.toHaveProperty("rowsIndex");
  });

  test.each([
    ["no photo", { image: null }, [["image", "imageRequired"]]],
    [
      "no article chosen",
      { linkKind: "product" },
      [["linkProductId", "articleRequired"]],
    ],
    [
      "an article id that is not one",
      { linkKind: "product", linkProductId: "1.5" },
      [["linkProductId", "articleRequired"]],
    ],
    [
      "no category chosen",
      { linkKind: "category" },
      [["linkCategoryId", "categoryRequired"]],
    ],
    ["a blank address", { linkKind: "url" }, [["linkUrl", "linkInvalid"]]],
    [
      "a javascript: address",
      { linkKind: "url", linkUrl: SCRIPT_URL },
      [["linkUrl", "linkInvalid"]],
    ],
    [
      "a long address",
      { linkKind: "url", linkUrl: `/${"a".repeat(500)}` },
      [["linkUrl", "linkTooLong"]],
    ],
    [
      "an English button alone",
      { ctaLabelEn: "Shop" },
      [["ctaLabelEn", "ctaNeedsTitle"]],
    ],
    [
      "days out of order",
      { endsOn: "2026-12-01", startsOn: "2026-12-05" },
      [["endsOn", "endBeforeStart"]],
    ],
    ["a blank title", { titleEs: "" }, [["titleEs", "titleRequired"]]],
    [
      "a long title",
      { titleEs: "a".repeat(61) },
      [["titleEs", "titleTooLong"]],
    ],
    [
      "a long button",
      { ctaLabelEs: "a".repeat(25) },
      [["ctaLabelEs", "ctaTooLong"]],
    ],
    [
      "a day off the calendar",
      { endsOn: "2026-13-01" },
      [["endsOn", "dateInvalid"]],
    ],
  ] as const)("says why it refuses %s", (_case, overrides, expected) => {
    expect(refusals(schema.safeParse(makeBannerFields(overrides)))).toEqual(
      expected
    );
  });
});

describe("createPageLayoutFormSchema", () => {
  const schema = createPageLayoutFormSchema({
    featuredCount: "featuredCount",
    repeated: "repeated",
  });

  function makeFields(
    overrides: Partial<PageLayoutFormFields> = {}
  ): PageLayoutFormFields {
    return {
      cover: [{ bannerId: 3 }, { bannerId: 1 }],
      featured: [],
      featuredPick: "8",
      ranking: [{ productId: 5 }],
      rankingPick: "",
      sections: [{ section: { kind: "best_sellers" } }],
      ...overrides,
    };
  }

  test("reads the lists into the order to save, leaving the pickers out", () => {
    expect(
      schema.parse(
        makeFields({ featured: [{ productId: 2 }, { productId: 4 }] })
      )
    ).toEqual({
      coverBannerIds: [3, 1],
      featuredProductIds: [2, 4],
      rankingProductIds: [5],
      sections: [{ kind: "best_sellers" }],
    });
  });

  test.each([
    [0, true],
    [1, false],
    [2, true],
    [4, true],
    [5, false],
  ])("%s featured are accepted: %s", (count, accepted) => {
    const result = schema.safeParse(
      makeFields({
        featured: Array.from({ length: count }, (_unused, index) => ({
          productId: index + 1,
        })),
      })
    );

    expect(result.success).toBe(accepted);
    expect(refusals(result)).toEqual(
      accepted ? [] : [["featured", "featuredCount"]]
    );
  });

  test.each<[string, Partial<PageLayoutFormFields>, string[][]]>([
    [
      "a banner twice in the cover",
      { cover: [{ bannerId: 3 }, { bannerId: 3 }] },
      [["cover", "repeated"]],
    ],
    [
      "a row twice",
      {
        sections: [
          { section: { categoryId: 2, kind: "category" } },
          { section: { categoryId: 2, kind: "category" } },
        ],
      },
      [["sections", "repeated"]],
    ],
    [
      "a category and a banner of the same id",
      {
        sections: [
          { section: { categoryId: 2, kind: "category" } },
          { section: { bannerId: 2, kind: "banner" } },
        ],
      },
      [],
    ],
  ])("an entry listed twice is refused: %s", (_case, overrides, expected) => {
    expect(refusals(schema.safeParse(makeFields(overrides)))).toEqual(expected);
  });
});

import { render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import type { PublicStore } from "@/server/services/store";
import { holdRequest, settle } from "@/test/connection";
import { DICTIONARIES } from "@/test/i18n";

import { StorePageFooter } from "../store-page-footer";
import ContactPage, { generateMetadata, instant } from "./page";

const {
  connection,
  contactProps,
  frameProps,
  readStore,
  shellOf,
  storeLocation,
} = vi.hoisted(() => ({
  // Where the store is, as the footer's own helper reads it (it has its
  // tests there): here, a line that says which store and language.
  storeLocation: vi.fn<
    (
      store: { name: string },
      locale: string
    ) => { lang: string; text: string } | null
  >((store, locale) => ({ lang: "es", text: `${store.name} ${locale}` })),
  connection: vi.fn(async () => undefined),
  contactProps: vi.fn<(props: Record<string, unknown>) => void>(),
  frameProps: vi.fn<(props: Record<string, unknown>) => void>(),
  readStore: vi.fn<() => Promise<PublicStore | null>>(),
  shellOf: vi.fn((store: { name: string }, locale: string) => ({
    shellOf: `${store.name} ${locale}`,
  })),
}));

// The frame's parts have their own tests (`store-shell.test.ts`).
vi.mock("../store-shell", () => ({ shellOf }));

// The frame has its own tests; here it records what the page handed it.
vi.mock("@/app/_components/organisms/store-frame", () => ({
  StoreFrame: ({
    children,
    ...props
  }: Record<string, unknown> & { children: ReactNode }) => {
    frameProps(props);
    return <div data-testid="store-frame">{children}</div>;
  },
}));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

vi.mock("next/server", () => ({ connection }));

// The cached read has its own tests; here it answers what the test says.
vi.mock("@/server/cache/store", () => ({ readStore }));

// The page's view has its own tests; here it records what it was handed.
vi.mock("@/app/_components/organisms/store-contact", () => ({
  StoreContact: (props: Record<string, unknown>) => {
    contactProps(props);
    return <div data-testid="contact-view" />;
  },
}));

vi.mock("@/lib/seo/origin", () => ({
  absoluteUrl: (path: string) => `http://localhost:3000${path}`,
}));

// The footer has its own tests; here it only shows whose it is.
vi.mock("../store-page-footer", () => ({
  StorePageFooter: ({
    locale,
    store,
  }: {
    locale: Locale;
    store: PublicStore;
  }) => <footer data-testid="footer">{`${store.name} ${locale}`}</footer>,
  storeLocation,
}));

const FAIR = "Feria del Parque · Puesto 12";

function makeStore(overrides: Partial<PublicStore> = {}): PublicStore {
  return {
    currencyCode: "UYU",
    id: 7,
    instagramUrl: "https://instagram.com/sample",
    name: "Sample Store",
    tiktokUrl: null,
    translations: [
      {
        description: "Anillos y cadenas.",
        locale: "es",
        location: FAIR,
        tagline: "Joyas en la feria",
      },
      {
        description: "Rings and chains.",
        locale: "en",
        location: null,
        tagline: "Jewelry at the fair",
      },
    ],
    whatsappNumber: "+59899123456",
    ...overrides,
  };
}

async function makeParams(locale: string) {
  return await Promise.resolve({ locale });
}

async function setup({
  locale = "es",
  store = makeStore(),
}: {
  locale?: Locale;
  store?: PublicStore | null;
} = {}) {
  readStore.mockResolvedValue(store);
  const page = await ContactPage({ params: makeParams(locale) });
  render(page);

  return { main: screen.getByTestId("store-contact-page"), page };
}

/** The page's JSON-LD, as a search engine reads it. */
function structuredData(): unknown {
  const script = document.querySelector('script[type="application/ld+json"]');

  return JSON.parse(script?.textContent ?? "null");
}

describe("ContactPage", () => {
  test.each([
    ["es", "/productos"],
    ["en", "/en/productos"],
  ] as const)(
    "in %s, hands the view the store, where it is, the page's words and the catalog in that language",
    async (locale, browseHref) => {
      const { main } = await setup({ locale });

      expect(main.tagName).toBe("MAIN");
      expect(contactProps).toHaveBeenCalledExactlyOnceWith({
        browseHref,
        copy: DICTIONARIES[locale].storefront,
        // Read for this store, in the page's language.
        location: { lang: "es", text: `Sample Store ${locale}` },
        store: makeStore(),
      });
      expect(storeLocation).toHaveBeenCalledExactlyOnceWith(
        makeStore(),
        locale
      );
      expect(main).toContainElement(screen.getByTestId("contact-view"));
    }
  );

  test("hands the view no place for a store that wrote none", async () => {
    storeLocation.mockReturnValueOnce(null);
    await setup();

    expect(contactProps).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ location: null })
    );
  });

  test.each(["es", "en"] as const)(
    "in %s, sits in the store's frame, made from the store it read, marked as the contact page",
    async (locale) => {
      await setup({ locale });

      expect(frameProps).toHaveBeenCalledExactlyOnceWith({
        copy: DICTIONARIES[locale].storefront.shell,
        currentPath: "/contacto",
        locale,
        shellOf: `Sample Store ${locale}`,
      });
      expect(screen.getByTestId("footer")).toHaveTextContent(
        `Sample Store ${locale}`
      );
    }
  );

  test("puts the page and its footer behind no boundary, so a crawler that runs no script reads them in the HTML", async () => {
    const { page } = await setup();
    const { children } = (page as ReactElement<{ children: ReactElement[] }>)
      .props;

    expect(children.map((part) => part.type)).toEqual([
      "main",
      StorePageFooter,
    ]);
    // The wait is intended: Next's instant-navigation check is told so.
    expect(instant).toBe(false);
  });

  test("reads the store only once a request is there: the build has no database", async () => {
    readStore.mockResolvedValue(makeStore());
    const request = holdRequest(connection);

    const pending = ContactPage({ params: makeParams("es") });
    await settle();

    expect(readStore).not.toHaveBeenCalled();

    request.arrive();
    await pending;

    expect(readStore).toHaveBeenCalledExactlyOnceWith();
  });

  test("answers the not-found page before the store's row exists", async () => {
    readStore.mockResolvedValue(null);

    await expect(
      ContactPage({ params: makeParams("es") })
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });

  test.each([
    [
      "es",
      "http://localhost:3000/",
      "http://localhost:3000/contacto",
      "Contacto",
    ],
    [
      "en",
      "http://localhost:3000/en",
      "http://localhost:3000/en/contacto",
      "Contact",
    ],
  ] as const)(
    "in %s, tells search engines how to reach the store and where the page sits",
    async (locale, home, here, title) => {
      await setup({ locale });

      expect(structuredData()).toEqual([
        {
          "@context": "https://schema.org",
          "@type": "Organization",
          contactPoint: {
            "@type": "ContactPoint",
            contactType: "customer service",
            telephone: "+59899123456",
          },
          logo: "http://localhost:3000/brand/lr-market-logo.svg",
          name: "Sample Store",
          sameAs: ["https://instagram.com/sample"],
          url: home,
        },
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", item: home, name: "Home", position: 1 },
            { "@type": "ListItem", item: here, name: title, position: 2 },
          ],
        },
      ]);
    }
  );

  test("a store with no number and no profile is named without a contact point", async () => {
    await setup({
      store: makeStore({ instagramUrl: null, whatsappNumber: null }),
    });

    expect(structuredData()).toEqual([
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        logo: "http://localhost:3000/brand/lr-market-logo.svg",
        name: "Sample Store",
        url: "http://localhost:3000/",
      },
      expect.objectContaining({ "@type": "BreadcrumbList" }),
    ]);
  });
});

describe("the contact page's metadata", () => {
  test.each([
    [
      "es",
      "Contacto",
      "Cómo contactar a Sample Store: WhatsApp, redes y dónde encontrarnos.",
      "/contacto",
    ],
    [
      "en",
      "Contact",
      "How to contact Sample Store: WhatsApp, social profiles and where to find us.",
      "/en/contacto",
    ],
  ] as const)(
    "in %s, is titled %j with the store's name, described in that language, with its canonical address and both languages",
    async (locale, title, description, canonical) => {
      readStore.mockResolvedValue(makeStore());

      await expect(
        generateMetadata({ params: makeParams(locale) })
      ).resolves.toEqual({
        alternates: {
          canonical,
          languages: {
            en: "/en/contacto",
            es: "/contacto",
            "x-default": "/contacto",
          },
        },
        description,
        openGraph: {
          description,
          siteName: "Sample Store",
          title,
          type: "website",
        },
        title: { absolute: `${title} · Sample Store` },
      });
    }
  );

  test("reads the store only once a request is there", async () => {
    readStore.mockResolvedValue(makeStore());
    const request = holdRequest(connection);

    const pending = generateMetadata({ params: makeParams("es") });
    await settle();

    expect(readStore).not.toHaveBeenCalled();

    request.arrive();
    await pending;

    expect(readStore).toHaveBeenCalledExactlyOnceWith();
  });

  test("before the store's row exists, is titled by the page alone", async () => {
    readStore.mockResolvedValue(null);

    await expect(
      generateMetadata({ params: makeParams("en") })
    ).resolves.toEqual({ title: "Contact" });
  });
});

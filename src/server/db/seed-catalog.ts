import { eq } from "drizzle-orm";

import type { DatabaseClient } from "@/server/db";
import {
  category,
  categoryTranslation,
  productImage,
  productImageTranslation,
} from "@/server/db/schema";
import {
  createAttribute,
  createAttributeValue,
  setProductAttributeValues,
} from "@/server/services/attribute";
import { createProduct, publishProduct } from "@/server/services/catalog";

interface SeedCategory {
  en: string;
  es: string;
  slug: string;
}

interface SeedArticle {
  /** The category's slug. */
  category: string;
  /** The slugs of the colors it carries (FER-033). */
  colors: string[];
  /** Two short paragraphs, split by a blank line: what it is, then how to wear it. */
  description: { en: string; es: string };
  image: {
    alt: { en: string; es: string };
    file: string;
    height: number;
    width: number;
  };
  isAvailable: boolean;
  /** In minor units of the store's currency (pesos for Lucas's store). */
  priceAmount: number;
  title: { en: string; es: string };
}

/**
 * The Color filter of Lucas's store (FER-033), the colors Lucas chose on
 * 2026-11-14, each with the swatch shown beside its name.
 */
export const SEED_COLORS = [
  { en: "Gold", es: "Dorado", slug: "dorado", swatch: "#d4af37" },
  { en: "Silver", es: "Plateado", slug: "plateado", swatch: "#c0c0c0" },
  { en: "Rose gold", es: "Oro rosa", slug: "oro-rosa", swatch: "#b76e79" },
  { en: "Black", es: "Negro", slug: "negro", swatch: "#111111" },
  { en: "White", es: "Blanco", slug: "blanco", swatch: "#ffffff" },
  { en: "Purple", es: "Violeta", slug: "violeta", swatch: "#8e44ad" },
  { en: "Red", es: "Rojo", slug: "rojo", swatch: "#c0392b" },
  { en: "Green", es: "Verde", slug: "verde", swatch: "#27ae60" },
  { en: "Blue", es: "Azul", slug: "azul", swatch: "#2980b9" },
];

/** The launch categories of Lucas's store, in their order (FER-010). */
export const SEED_CATEGORIES: SeedCategory[] = [
  { en: "Bubble guns", es: "Burbujeros", slug: "burbujeros" },
  { en: "Chains", es: "Cadenas", slug: "cadenas" },
  { en: "Rings", es: "Anillos", slug: "anillos" },
  { en: "Earrings", es: "Aros", slug: "aros" },
  { en: "Bracelets", es: "Pulseras", slug: "pulseras" },
];

/**
 * Sample articles with the photos in `public/seed/` (credits in
 * `docs/brand/seed-photos.md`), one of them unavailable so that state has a
 * row to show. Prices are invented.
 */
export const SEED_ARTICLES: SeedArticle[] = [
  {
    colors: ["azul"],
    category: "burbujeros",
    description: {
      en: "A clear bubble gun that shoots a stream of bubbles at the press of a trigger.\n\nIt runs on batteries and comes with bubble liquid to start right away. Made for the park, a birthday or a sunny day at the fair.",
      es: "Un burbujero transparente que lanza una lluvia de burbujas con solo apretar el gatillo.\n\nFunciona a pilas y viene con líquido para empezar a jugar. Ideal para la plaza, un cumpleaños o un día de sol en la feria.",
    },
    image: {
      alt: {
        en: "Clear bubble gun with bubbles behind it",
        es: "Burbujero transparente con burbujas detrás",
      },
      file: "bubble-gun-1.jpg",
      height: 899,
      width: 1199,
    },
    isAvailable: true,
    priceAmount: 69_000,
    title: { en: "Crystal bubble gun", es: "Burbujero cristal" },
  },
  {
    colors: ["plateado"],
    category: "cadenas",
    description: {
      en: "A fine silver chain with small heart charms spread along it.\n\nIts length adjusts, so you can wear it close to the neck or a little lower. It looks good on its own or layered with a shorter chain.",
      es: "Una cadena fina de plata con pequeños dijes de corazón repartidos a lo largo.\n\nEl largo se regula, así que la podés usar pegada al cuello o un poco más abajo. Queda linda sola o combinada con otra cadena más corta.",
    },
    image: {
      alt: {
        en: "Silver chain with heart charms",
        es: "Cadena de plata con dijes de corazón",
      },
      file: "necklace-1.jpg",
      height: 1026,
      width: 1200,
    },
    isAvailable: true,
    priceAmount: 89_000,
    title: { en: "Hearts chain", es: "Cadena corazones" },
  },
  {
    colors: ["plateado"],
    category: "cadenas",
    description: {
      en: "A silver box chain with a bright pendant at its center.\n\nIt comes in a gift box, ready to give. It suits a plain tee or an open neckline, by day or at night.",
      es: "Una cadena de plata tipo veneciana con un dije brillante al centro.\n\nViene en caja de regalo, lista para dar. Va bien con una remera lisa o con un escote abierto, de día o de noche.",
    },
    image: {
      alt: {
        en: "Silver chain with a bright pendant",
        es: "Cadena de plata con dije brillante",
      },
      file: "necklace-2.jpg",
      height: 800,
      width: 1200,
    },
    isAvailable: true,
    priceAmount: 119_000,
    title: { en: "Shine pendant", es: "Dije brillo" },
  },
  {
    colors: ["dorado"],
    category: "cadenas",
    description: {
      en: "A gold-plated rope chain with a crown pendant.\n\nThe twisted rope weave gives it body and shine. Wear it on its own, over your clothes, so the pendant shows.",
      es: "Una cadena tipo soga con baño de oro y un dije de corona.\n\nEl tejido en soga le da cuerpo y brillo. Usala sola, por fuera de la ropa, para que el dije se luzca.",
    },
    image: {
      alt: {
        en: "Gold rope chain with a crown pendant",
        es: "Cadena dorada tipo soga con dije de corona",
      },
      file: "necklace-3.jpg",
      height: 1200,
      width: 801,
    },
    isAvailable: false,
    priceAmount: 149_000,
    title: { en: "Crown chain", es: "Cadena corona" },
  },
  {
    colors: ["dorado"],
    category: "anillos",
    description: {
      en: "A gold-plated ring with an emerald-cut stone.\n\nThe rectangular stone, held by four prongs, takes center stage. For a special day, or to lift an everyday outfit.",
      es: "Un anillo con baño de oro y una piedra de talle esmeralda.\n\nLa piedra rectangular, sostenida por cuatro garras, es la protagonista. Para un día especial o para darle un toque a lo de todos los días.",
    },
    image: {
      alt: {
        en: "Gold ring with a clear stone",
        es: "Anillo dorado con piedra transparente",
      },
      file: "ring-1.jpg",
      height: 1200,
      width: 1200,
    },
    isAvailable: true,
    priceAmount: 99_000,
    title: { en: "Solitaire ring", es: "Anillo solitario" },
  },
  {
    colors: ["dorado"],
    category: "anillos",
    description: {
      en: "A gold-plated signet ring with a raised medallion.\n\nIts wide face stands out on the hand. Wear it on the little or ring finger, alone or with thin rings.",
      es: "Un anillo sello con baño de oro y un medallón en relieve.\n\nTiene un frente ancho que se nota en la mano. Se usa en el meñique o en el anular, solo o junto a anillos finos.",
    },
    image: {
      alt: { en: "Gold signet ring", es: "Anillo sello dorado" },
      file: "ring-2.jpg",
      height: 800,
      width: 1200,
    },
    isAvailable: true,
    priceAmount: 79_000,
    title: { en: "Signet ring", es: "Anillo sello" },
  },
  {
    colors: ["dorado", "oro-rosa"],
    category: "anillos",
    description: {
      en: "A gold-plated ring with pink stones clustered into a flower.\n\nTogether the stones make a large, bright face. It goes well with gold and pink tones.",
      es: "Un anillo con baño de oro y piedras rosadas agrupadas en forma de flor.\n\nLas piedras juntas forman un frente grande y luminoso. Combina con tonos dorados y rosados.",
    },
    image: {
      alt: {
        en: "Gold ring with pink stones",
        es: "Anillo dorado con piedras rosadas",
      },
      file: "ring-3.jpg",
      height: 800,
      width: 1200,
    },
    isAvailable: true,
    priceAmount: 109_050,
    title: { en: "Pink flower ring", es: "Anillo flor rosa" },
  },
  {
    colors: ["dorado"],
    category: "aros",
    description: {
      en: "Small gold-plated stud earrings.\n\nThey are discreet and comfortable, for every day. They pair with any other earring if you have more than one piercing.",
      es: "Aros pequeños abotonados, con baño de oro.\n\nSon discretos y cómodos, para usar todos los días. Combinan con cualquier otro aro si tenés más de una perforación.",
    },
    image: {
      alt: { en: "Gold stud earrings", es: "Aros dorados pequeños" },
      file: "earrings-1.jpg",
      height: 1200,
      width: 1200,
    },
    isAvailable: true,
    priceAmount: 49_000,
    title: { en: "Gold studs", es: "Aros abotonados" },
  },
  {
    colors: ["plateado", "blanco"],
    category: "aros",
    description: {
      en: "Earrings of crystals shaped like a wreath of leaves.\n\nThe crystals catch the light with every move. Made for a night out, a party or an event.",
      es: "Aros de cristales en forma de corona de hojas.\n\nLos cristales reflejan la luz con cada movimiento. Pensados para salir, una fiesta o un evento.",
    },
    image: {
      alt: { en: "Crystal wreath earrings", es: "Aros de cristales" },
      file: "earrings-2.jpg",
      height: 1200,
      width: 1200,
    },
    isAvailable: true,
    priceAmount: 89_000,
    title: { en: "Crystal wreath earrings", es: "Aros corona de cristal" },
  },
  {
    colors: ["dorado"],
    category: "pulseras",
    description: {
      en: "A fine gold-plated bracelet with an ID tag at its center.\n\nThe tag is plain, ready to engrave with a name, a date or an initial. A personal gift for someone special.",
      es: "Una pulsera fina con baño de oro y una chapita al centro.\n\nLa chapita es lisa, para grabarle un nombre, una fecha o una inicial. Un regalo personal para alguien especial.",
    },
    image: {
      alt: {
        en: "Fine gold bracelet with an ID tag",
        es: "Pulsera dorada fina con chapita",
      },
      file: "bracelet-1.jpg",
      height: 1200,
      width: 800,
    },
    isAvailable: true,
    priceAmount: 69_000,
    title: { en: "ID bracelet", es: "Pulsera chapita" },
  },
  {
    colors: ["dorado"],
    category: "pulseras",
    description: {
      en: "A pair of gold-plated bangles.\n\nWear them together, so they chime as you move, or one on each wrist. They add shine to any outfit.",
      es: "Un par de esclavas con baño de oro.\n\nSe pueden usar juntas, para que suenen al moverse, o una en cada muñeca. Suman brillo a cualquier conjunto.",
    },
    image: {
      alt: { en: "Two gold bangles", es: "Dos esclavas doradas" },
      file: "bracelet-2.jpg",
      height: 1200,
      width: 1200,
    },
    isAvailable: true,
    priceAmount: 129_000,
    title: { en: "Bangle pair", es: "Par de esclavas" },
  },
];

/**
 * Lucas's launch categories and sample articles, published, in `storeId`.
 * Run only on a store that has no category yet, so a second seed run, or a
 * store whose owner already set up a catalog, is left alone. Returns how
 * many articles it created.
 */
export async function seedCatalog(
  tx: DatabaseClient,
  storeId: number
): Promise<number> {
  const existing = await tx.query.category.findFirst({
    columns: { id: true },
    where: eq(category.storeId, storeId),
  });

  if (existing) {
    return 0;
  }

  const categoryIds = new Map<string, number>();
  const color = await createAttribute(tx, {
    storeId,
    values: { nameEn: "Color", nameEs: "Color" },
  });
  const colorIds = new Map<string, number>();

  for (const seedColor of SEED_COLORS) {
    const created = await createAttributeValue(tx, {
      attributeId: color.id,
      storeId,
      swatchColor: seedColor.swatch,
      values: { nameEn: seedColor.en, nameEs: seedColor.es },
    });
    colorIds.set(seedColor.slug, created.id);
  }

  for (const [position, seedCategory] of SEED_CATEGORIES.entries()) {
    const [row] = await tx
      .insert(category)
      .values({ position, slug: seedCategory.slug, storeId })
      .returning({ id: category.id });

    if (!row) {
      throw new Error("Inserting a category returned no row");
    }

    categoryIds.set(seedCategory.slug, row.id);
    await tx.insert(categoryTranslation).values([
      { categoryId: row.id, locale: "es", name: seedCategory.es },
      { categoryId: row.id, locale: "en", name: seedCategory.en },
    ]);
  }

  for (const article of SEED_ARTICLES) {
    const created = await createProduct(tx, {
      storeId,
      values: {
        categoryId: categoryIds.get(article.category) ?? null,
        isAvailable: article.isAvailable,
        priceAmount: article.priceAmount,
        translations: (["es", "en"] as const).map((locale) => ({
          description: article.description[locale],
          locale,
          seoDescription: null,
          seoTitle: null,
          title: article.title[locale],
        })),
      },
    });
    const [image] = await tx
      .insert(productImage)
      .values({
        height: article.image.height,
        position: 0,
        productId: created.id,
        url: `/seed/${article.image.file}`,
        width: article.image.width,
      })
      .returning({ id: productImage.id });

    if (!image) {
      throw new Error("Inserting an image returned no row");
    }

    await tx.insert(productImageTranslation).values([
      { altText: article.image.alt.es, locale: "es", productImageId: image.id },
      { altText: article.image.alt.en, locale: "en", productImageId: image.id },
    ]);
    await publishProduct(tx, { id: created.id, storeId });
    await setProductAttributeValues(tx, {
      productId: created.id,
      storeId,
      valueIds: article.colors.flatMap((slug) => {
        const id = colorIds.get(slug);
        return id === undefined ? [] : [id];
      }),
    });
  }

  return SEED_ARTICLES.length;
}

/** A photo in `public/seed/`, credited in `docs/brand/seed-photos.md`. */
export interface SeedPhoto {
  alt: { en: string; es: string };
  height: number;
  width: number;
}

/**
 * Every sample photo by its file name, with its size and what it shows. The
 * words describe what the photo shows (a gold tone, clear stones), never a
 * material nobody checked: they are stock photos, not the store's pieces.
 */
export const SEED_PHOTOS = {
  "bracelet-1.jpg": {
    alt: {
      en: "Fine gold bracelet with an ID tag",
      es: "Pulsera dorada fina con chapita",
    },
    height: 1200,
    width: 800,
  },
  "bracelet-2.jpg": {
    alt: { en: "Two gold bangles", es: "Dos esclavas doradas" },
    height: 1200,
    width: 1200,
  },
  "bracelet-3.jpg": {
    alt: {
      en: "Two textured bangles on a wrist",
      es: "Dos esclavas texturadas en la muñeca",
    },
    height: 1600,
    width: 1600,
  },
  "bracelet-4.jpg": {
    alt: {
      en: "Two gold bangles on a wrist",
      es: "Dos esclavas doradas en la muñeca",
    },
    height: 1600,
    width: 1600,
  },
  "bracelet-5.jpg": {
    alt: {
      en: "Chunky gold chain bracelet on a wrist",
      es: "Pulsera de cadena dorada gruesa en la muñeca",
    },
    height: 1600,
    width: 1066,
  },
  "bracelet-6.jpg": {
    alt: {
      en: "Gold link bracelet on pink",
      es: "Pulsera de eslabones dorados sobre fondo rosa",
    },
    height: 1067,
    width: 1600,
  },
  "bracelet-7.jpg": {
    alt: {
      en: "Chain bracelet with tag charms on a wrist",
      es: "Pulsera de cadena con dijes de chapita en la muñeca",
    },
    height: 1600,
    width: 1066,
  },
  "bracelet-8.jpg": {
    alt: {
      en: "Silver bracelet with clear crystals",
      es: "Pulsera plateada con cristales transparentes",
    },
    height: 1061,
    width: 1600,
  },
  "bubble-gun-1.jpg": {
    alt: {
      en: "Clear bubble gun with bubbles behind it",
      es: "Burbujero transparente con burbujas detrás",
    },
    height: 899,
    width: 1199,
  },
  "bubble-gun-2.jpg": {
    alt: {
      en: "Yellow fish-shaped bubble gun",
      es: "Burbujero con forma de pez amarillo",
    },
    height: 1067,
    width: 1600,
  },
  "bubble-gun-3.jpg": {
    alt: {
      en: "Pink bubble gun blowing bubbles",
      es: "Burbujero rosa lanzando burbujas",
    },
    height: 1600,
    width: 1115,
  },
  "bubble-toy-1.jpg": {
    alt: {
      en: "Hand holding a bubble toy",
      es: "Mano sosteniendo un juguete de burbujas",
    },
    height: 1067,
    width: 1600,
  },
  "bubbles-1.jpg": {
    alt: {
      en: "Little girl blowing bubbles with a wand",
      es: "Nena soplando burbujas con una varita",
    },
    height: 1063,
    width: 1600,
  },
  "bubbles-2.jpg": {
    alt: {
      en: "Children playing among bubbles in a park",
      es: "Chicos jugando entre burbujas en una plaza",
    },
    height: 1600,
    width: 1029,
  },
  "earrings-1.jpg": {
    alt: { en: "Gold stud earrings", es: "Aros dorados pequeños" },
    height: 1200,
    width: 1200,
  },
  "earrings-2.jpg": {
    alt: { en: "Crystal wreath earrings", es: "Aros de cristales" },
    height: 1200,
    width: 1200,
  },
  "earrings-3.jpg": {
    alt: {
      en: "Chunky gold hoop earrings",
      es: "Aros argolla dorados gruesos",
    },
    height: 1600,
    width: 1600,
  },
  "earrings-4.jpg": {
    alt: {
      en: "Textured silver hoop earrings",
      es: "Aros argolla plateados con relieve",
    },
    height: 1067,
    width: 1600,
  },
  "earrings-5.jpg": {
    alt: {
      en: "Flower-shaped crystal earrings",
      es: "Aros en forma de flor con cristales",
    },
    height: 1067,
    width: 1600,
  },
  "earrings-6.jpg": {
    alt: {
      en: "Gold butterfly stud earring",
      es: "Aro dorado con forma de mariposa",
    },
    height: 1600,
    width: 1066,
  },
  "earrings-7.jpg": {
    alt: {
      en: "Pearl-style stud earrings on a white box",
      es: "Aros estilo perla sobre una caja blanca",
    },
    height: 1600,
    width: 1280,
  },
  "earrings-8.jpg": {
    alt: {
      en: "Woman wearing a gold hoop earring",
      es: "Mujer con un aro argolla dorado",
    },
    height: 1600,
    width: 1066,
  },
  "necklace-1.jpg": {
    alt: {
      en: "Silver chain with heart charms",
      es: "Cadena plateada con dijes de corazón",
    },
    height: 1026,
    width: 1200,
  },
  "necklace-2.jpg": {
    alt: {
      en: "Silver chain with a bright pendant",
      es: "Cadena plateada con dije brillante",
    },
    height: 800,
    width: 1200,
  },
  "necklace-3.jpg": {
    alt: {
      en: "Gold rope chain with a crown pendant",
      es: "Cadena dorada tipo soga con dije de corona",
    },
    height: 1200,
    width: 801,
  },
  "necklace-4.jpg": {
    alt: {
      en: "Textured gold chains and bangles",
      es: "Cadenas y esclavas doradas con relieve",
    },
    height: 1067,
    width: 1600,
  },
  "necklace-5.jpg": {
    alt: {
      en: "Fine gold chain with a rectangular tag",
      es: "Cadena dorada fina con chapita rectangular",
    },
    height: 1600,
    width: 1066,
  },
  "necklace-6.jpg": {
    alt: {
      en: "Dark chain with an openwork heart pendant",
      es: "Cadena oscura con dije de corazón calado",
    },
    height: 1067,
    width: 1600,
  },
  "necklace-7.jpg": {
    alt: {
      en: "Gold chain with a blue-green stone",
      es: "Cadena dorada con piedra azul verdosa",
    },
    height: 1600,
    width: 1066,
  },
  "necklace-8.jpg": {
    alt: {
      en: "Silver chain with a black pendant, worn",
      es: "Cadena plateada con dije negro, puesta",
    },
    height: 1600,
    width: 1125,
  },
  "ring-1.jpg": {
    alt: {
      en: "Gold ring with a clear stone",
      es: "Anillo dorado con piedra transparente",
    },
    height: 1200,
    width: 1200,
  },
  "ring-2.jpg": {
    alt: { en: "Gold signet ring", es: "Anillo sello dorado" },
    height: 800,
    width: 1200,
  },
  "ring-3.jpg": {
    alt: {
      en: "Gold ring with pink stones",
      es: "Anillo dorado con piedras rosadas",
    },
    height: 800,
    width: 1200,
  },
  "ring-4.jpg": {
    alt: {
      en: "Silver ring with a stone framed by small stones",
      es: "Anillo plateado con una piedra rodeada de piedritas",
    },
    height: 1067,
    width: 1600,
  },
  "ring-5.jpg": {
    alt: {
      en: "Black band ring with gold edges",
      es: "Anillo de banda negra con bordes dorados",
    },
    height: 1195,
    width: 1600,
  },
  "ring-6.jpg": {
    alt: {
      en: "Silver ring with a row of stones",
      es: "Anillo plateado con una fila de piedras",
    },
    height: 1067,
    width: 1600,
  },
  "ring-7.jpg": {
    alt: {
      en: "Silver ring with a stone beside a thin band",
      es: "Anillo plateado con piedra junto a una alianza fina",
    },
    height: 1067,
    width: 1600,
  },
  "ring-8.jpg": {
    alt: {
      en: "Thin gold, silver and rose rings",
      es: "Anillos finos dorados, plateados y rosados",
    },
    height: 1600,
    width: 1200,
  },
  "ring-9.jpg": {
    alt: {
      en: "Hands wearing silver rings",
      es: "Manos con anillos plateados",
    },
    height: 1067,
    width: 1600,
  },
} satisfies Record<string, SeedPhoto>;

export type SeedPhotoFile = keyof typeof SEED_PHOTOS;

export interface SeedArticle {
  /** The category's slug. */
  category: string;
  /** The slugs of the colors it carries (FER-033). */
  colors: string[];
  /**
   * Three short paragraphs, split by a blank line: what it is, its finish,
   * then how to wear, use or give it.
   */
  description: { en: string; es: string };
  /** Its photos in order, the first its cover. */
  images: SeedPhotoFile[];
  isAvailable: boolean;
  /** In minor units of the store's currency (pesos for Lucas's store). */
  priceAmount: number;
  title: { en: string; es: string };
}

/** Builds an article's entry; every sample article is for sale but one. */
function article(
  category: string,
  values: Omit<SeedArticle, "category" | "isAvailable"> & {
    isAvailable?: boolean;
  }
): SeedArticle {
  return { category, isAvailable: true, ...values };
}

const BUBBLE_GUNS = [
  article("burbujeros", {
    colors: ["azul"],
    description: {
      en: "A clear bubble gun that sends out a shower of bubbles at the squeeze of a trigger.\n\nIts see-through body has blue details, so you can watch the liquid inside.\n\nFill it with bubble liquid and take it to the park, a birthday party or a sunny day at the fair.",
      es: "Un burbujero transparente que lanza una lluvia de burbujas con solo apretar el gatillo.\n\nEl cuerpo transparente tiene detalles azules y deja ver el líquido por dentro.\n\nLlenalo con líquido para burbujas y llevalo a la plaza, a un cumpleaños o a un día de sol en la feria.",
    },
    images: ["bubble-gun-1.jpg"],
    priceAmount: 69_000,
    title: { en: "Crystal bubble gun", es: "Burbujero cristal" },
  }),
  article("burbujeros", {
    colors: ["verde"],
    description: {
      en: "A yellow fish-shaped bubble gun that blows bubbles out of its mouth.\n\nIt has bright colors and a bottle in sight for the liquid, easy to hold in one hand.\n\nA fun gift for little ones, made for playing outdoors in the summer.",
      es: "Un burbujero con forma de pez amarillo que larga burbujas por la boca.\n\nTiene colores vivos y el frasco del líquido a la vista, fácil de agarrar con una mano.\n\nUn regalo divertido para los más chicos, ideal para jugar al aire libre en verano.",
    },
    images: [
      "bubble-gun-2.jpg",
      "bubbles-2.jpg",
      "bubbles-1.jpg",
      "bubble-toy-1.jpg",
      "bubble-gun-1.jpg",
    ],
    priceAmount: 79_000,
    title: { en: "Fish bubble gun", es: "Burbujero pez" },
  }),
  article("burbujeros", {
    colors: ["rojo"],
    description: {
      en: "A pink bubble gun that lets out a cloud of bubbles with every shot.\n\nIts bright color makes it easy to spot among the toys.\n\nPerfect for photos, parties and afternoons of play in the yard.",
      es: "Un burbujero rosa que suelta una nube de burbujas en cada disparo.\n\nSu color llamativo lo hace fácil de encontrar entre los juguetes.\n\nPerfecto para fotos, fiestas y tardes de juego en el patio.",
    },
    images: ["bubble-gun-3.jpg"],
    priceAmount: 89_000,
    title: { en: "Pink bubble gun", es: "Burbujero rosa" },
  }),
  article("burbujeros", {
    colors: ["azul"],
    description: {
      en: "A bubble toy shaped like a little character, comfortable in a child's hand.\n\nIt is light blue and white, with a friendly face that makes kids smile.\n\nTake it to the park or the beach and make a shower of bubbles in seconds.",
      es: "Un juguete de burbujas con forma de muñeco, cómodo para la mano de un chico.\n\nEs celeste y blanco, con una cara simpática que hace sonreír.\n\nLlevalo a la plaza o a la playa y armá una lluvia de burbujas en segundos.",
    },
    images: ["bubble-toy-1.jpg"],
    priceAmount: 59_000,
    title: { en: "Character bubble toy", es: "Burbujero muñeco" },
  }),
  article("burbujeros", {
    colors: ["azul"],
    description: {
      en: "A wand for blowing bubbles, the classic kind.\n\nIt has a ring at the tip that you dip into the bottle of liquid.\n\nA classic to give at a birthday party or to add to a party bag.",
      es: "Una varita para hacer burbujas soplando, la de toda la vida.\n\nTiene un aro en la punta que se moja en el frasco de líquido.\n\nUn clásico para regalar en un cumpleaños o sumar a la bolsita de sorpresas.",
    },
    images: ["bubbles-1.jpg"],
    priceAmount: 29_000,
    title: { en: "Bubble wand", es: "Varita de burbujas" },
  }),
  article("burbujeros", {
    colors: ["blanco"],
    description: {
      en: "Liquid to refill your bubble gun or your wand.\n\nPour it straight into the gun's bottle or into a bowl for the wand.\n\nKeep one at hand so the game never stops halfway.",
      es: "Líquido para recargar tu burbujero o tu varita.\n\nSe vuelca directo en el frasco del burbujero o en un recipiente para la varita.\n\nTené siempre uno a mano para que el juego no se corte a la mitad.",
    },
    images: ["bubbles-2.jpg"],
    priceAmount: 25_000,
    title: { en: "Bubble liquid", es: "Líquido para burbujas" },
  }),
  article("burbujeros", {
    colors: ["azul"],
    description: {
      en: "A pack of bubble wands for playing together.\n\nEach wand has its own ring to dip in the liquid and blow.\n\nGreat for birthday parties, group outings or sharing between siblings.",
      es: "Un pack de varitas de burbujas para jugar entre varios.\n\nCada varita tiene su aro para mojar en el líquido y soplar.\n\nIdeal para cumpleaños, salidas en grupo o para repartir entre hermanos.",
    },
    images: ["bubbles-1.jpg", "bubbles-2.jpg"],
    priceAmount: 69_000,
    title: { en: "Bubble wand pack", es: "Pack de varitas" },
  }),
];

const CHAINS = [
  article("cadenas", {
    colors: ["plateado"],
    description: {
      en: "A fine chain with small heart charms spread along it.\n\nIt has a silver tone, and the hearts catch the light.\n\nIt looks good on its own or layered with a shorter chain, and makes a sweet gift for someone special.",
      es: "Una cadena fina con pequeños dijes de corazón repartidos a lo largo.\n\nEs de tono plateado y los corazones brillan con la luz.\n\nQueda linda sola o combinada con otra cadena más corta, y es un regalo dulce para alguien especial.",
    },
    images: [
      "necklace-1.jpg",
      "necklace-6.jpg",
      "necklace-2.jpg",
      "necklace-8.jpg",
    ],
    priceAmount: 89_000,
    title: { en: "Hearts chain", es: "Cadena corazones" },
  }),
  article("cadenas", {
    colors: ["plateado"],
    description: {
      en: "A box chain with a bright pendant at its center.\n\nThe chain is silver-toned, and the pendant has small stones that reflect the light.\n\nIt suits a plain tee or an open neckline, by day or at night.",
      es: "Una cadena tipo veneciana con un dije brillante al centro.\n\nLa cadena es de tono plateado y el dije tiene piedritas que reflejan la luz.\n\nVa bien con una remera lisa o con un escote abierto, de día o de noche.",
    },
    images: ["necklace-2.jpg"],
    priceAmount: 119_000,
    title: { en: "Shine pendant", es: "Dije brillo" },
  }),
  article("cadenas", {
    colors: ["dorado"],
    description: {
      en: "A rope chain with a crown pendant.\n\nIt has a gold tone, and the twisted rope weave gives it body and shine.\n\nWear it on its own, over your clothes, so the pendant shows.",
      es: "Una cadena tipo soga con un dije de corona.\n\nEs de tono dorado, y el tejido en soga le da cuerpo y brillo.\n\nUsala sola y por fuera de la ropa, para que el dije se luzca.",
    },
    images: ["necklace-3.jpg"],
    isAvailable: false,
    priceAmount: 149_000,
    title: { en: "Crown chain", es: "Cadena corona" },
  }),
  article("cadenas", {
    colors: ["dorado"],
    description: {
      en: "A gold-toned chain of textured links.\n\nEach link has a raised pattern that shines differently as the light moves.\n\nPair it with bracelets in the same tone for a matching look.",
      es: "Una cadena de eslabones con textura, de tono dorado.\n\nCada eslabón tiene un relieve que brilla distinto según le pegue la luz.\n\nCombinala con pulseras del mismo tono para un conjunto parejo.",
    },
    images: ["necklace-4.jpg"],
    priceAmount: 129_000,
    title: { en: "Textured link chain", es: "Cadena eslabones trabajada" },
  }),
  article("cadenas", {
    colors: ["dorado"],
    description: {
      en: "A fine chain with a rectangular tag hanging from it.\n\nIt has a gold tone, and the tag is plain, simple and neat.\n\nWear it every day, alone or with other chains: it is a gift that always works.",
      es: "Una cadena fina con una chapita rectangular colgando.\n\nEs de tono dorado y la chapita es lisa, sencilla y prolija.\n\nSe usa todos los días, sola o con otras cadenas, y es un regalo que siempre queda bien.",
    },
    images: [
      "necklace-5.jpg",
      "necklace-3.jpg",
      "necklace-4.jpg",
      "necklace-7.jpg",
    ],
    priceAmount: 99_000,
    title: { en: "Tag chain", es: "Cadena con chapita" },
  }),
  article("cadenas", {
    colors: ["negro"],
    description: {
      en: "A chain with an openwork heart pendant.\n\nThe chain and the heart have a dark, aged tone with a raised pattern.\n\nA different touch for an everyday look, or a gift for someone who skips the classics.",
      es: "Una cadena con un dije de corazón calado.\n\nLa cadena y el corazón tienen un tono oscuro, envejecido, con un trabajo en relieve.\n\nUn toque distinto para el día a día, o un regalo para quien no usa lo clásico.",
    },
    images: ["necklace-6.jpg"],
    priceAmount: 79_000,
    title: { en: "Openwork heart pendant", es: "Dije corazón calado" },
  }),
  article("cadenas", {
    colors: ["dorado", "azul"],
    description: {
      en: "A gold-toned chain with a large blue-green stone.\n\nThe stone sits in a gold frame, and its facets play with the light.\n\nWear it with a simple neckline: the pendant is the star.",
      es: "Una cadena dorada con una piedra grande de color azul verdoso.\n\nLa piedra está enmarcada en dorado y sus caras juegan con la luz.\n\nLucila con un escote simple: el dije es el protagonista.",
    },
    images: ["necklace-7.jpg"],
    priceAmount: 139_000,
    title: { en: "Blue stone pendant", es: "Dije piedra azul" },
  }),
  article("cadenas", {
    colors: ["plateado", "negro"],
    description: {
      en: "A silver-toned link chain with a pointed black pendant.\n\nThe contrast between silver and black gives it a modern feel.\n\nIt goes with a tee, an open shirt or a sweatshirt.",
      es: "Una cadena de eslabones de tono plateado con un dije negro en punta.\n\nEl contraste entre el plateado y el negro le da un aire moderno.\n\nVa con remera, con camisa abierta o con buzo.",
    },
    images: ["necklace-8.jpg"],
    priceAmount: 89_000,
    title: { en: "Black pendant chain", es: "Cadena dije negro" },
  }),
  article("cadenas", {
    colors: ["dorado"],
    description: {
      en: "A very fine gold-toned chain, to wear alone or with a pendant.\n\nIts soft gold tone never competes with your other pieces.\n\nAdd your favorite pendant, or layer it with chains of other lengths.",
      es: "Una cadena dorada bien fina, para usar sola o con un dije.\n\nSu tono dorado es suave y no compite con otras piezas.\n\nSumale el dije que más te guste o combinala con cadenas de otro largo.",
    },
    images: ["necklace-5.jpg"],
    priceAmount: 59_000,
    title: { en: "Fine gold chain", es: "Cadena fina dorada" },
  }),
];

const RINGS = [
  article("anillos", {
    colors: ["dorado"],
    description: {
      en: "A ring with a clear, rectangular-cut stone.\n\nIt has a gold tone, and four prongs hold the stone.\n\nFor a special day, or to lift an everyday outfit.",
      es: "Un anillo con una piedra transparente de talle rectangular.\n\nEs de tono dorado y la piedra está sostenida por cuatro garras.\n\nPara un día especial o para darle un toque a lo de todos los días.",
    },
    images: ["ring-1.jpg"],
    priceAmount: 99_000,
    title: { en: "Solitaire ring", es: "Anillo solitario" },
  }),
  article("anillos", {
    colors: ["plateado", "blanco"],
    description: {
      en: "A ring with a center stone framed by a halo of small stones.\n\nIt has a silver tone, and the clear stones give it plenty of sparkle.\n\nMade for a special date, or a gift for a big moment.",
      es: "Un anillo con una piedra central rodeada por una corona de piedritas.\n\nEs de tono plateado y las piedras transparentes le dan mucho brillo.\n\nIdeal para una fecha especial o para regalar en un momento importante.",
    },
    images: [
      "ring-4.jpg",
      "ring-7.jpg",
      "ring-9.jpg",
      "ring-6.jpg",
      "ring-8.jpg",
    ],
    priceAmount: 119_000,
    title: { en: "Halo ring", es: "Anillo halo" },
  }),
  article("anillos", {
    colors: ["dorado"],
    description: {
      en: "A signet ring with a raised medallion.\n\nIt has a gold tone and a wide face that stands out on the hand.\n\nWear it on the little or ring finger, alone or with thin rings.",
      es: "Un anillo sello con un medallón en relieve.\n\nEs de tono dorado y tiene un frente ancho que se nota en la mano.\n\nSe usa en el meñique o en el anular, solo o junto a anillos finos.",
    },
    images: ["ring-2.jpg"],
    priceAmount: 79_000,
    title: { en: "Signet ring", es: "Anillo sello" },
  }),
  article("anillos", {
    colors: ["dorado", "oro-rosa"],
    description: {
      en: "A ring with pink stones clustered into a flower.\n\nThe band has a gold tone, and together the stones make a large, bright face.\n\nIt goes well with gold and pink tones, and makes a lovely birthday gift.",
      es: "Un anillo con piedras rosadas agrupadas en forma de flor.\n\nEl aro es de tono dorado y las piedras juntas forman un frente grande y luminoso.\n\nCombina con tonos dorados y rosados, y es un lindo regalo de cumpleaños.",
    },
    images: ["ring-3.jpg"],
    priceAmount: 109_050,
    title: { en: "Pink flower ring", es: "Anillo flor rosa" },
  }),
  article("anillos", {
    colors: ["negro", "dorado"],
    description: {
      en: "A wide black band ring with gold edges.\n\nThe band has a dotted pattern that gives it texture.\n\nIt looks good alone, or with thin gold rings on the other hand.",
      es: "Un anillo de banda ancha negra con bordes dorados.\n\nLa banda tiene un trabajo de puntitos que le da textura.\n\nQueda bien solo, o con anillos dorados finos en la otra mano.",
    },
    images: ["ring-5.jpg"],
    priceAmount: 89_000,
    title: { en: "Black band ring", es: "Anillo banda negra" },
  }),
  article("anillos", {
    colors: ["plateado"],
    description: {
      en: "A silver-toned ring with a row of clear stones across the front.\n\nThe stones sit in line inside the band, so they do not catch on clothes.\n\nA comfortable ring for every day, or to sit beside a bigger one.",
      es: "Un anillo plateado con una fila de piedras transparentes al frente.\n\nLas piedras van alineadas dentro del aro, así no se enganchan con la ropa.\n\nUn anillo cómodo para todos los días, o para acompañar uno más grande.",
    },
    images: ["ring-6.jpg"],
    priceAmount: 99_000,
    title: { en: "Row of stones ring", es: "Anillo fila de piedras" },
  }),
  article("anillos", {
    colors: ["plateado"],
    description: {
      en: "A silver-toned ring with a clear stone at its center.\n\nThe band is slim and leaves the stone in the spotlight.\n\nA classic gift that pairs well with a thin band.",
      es: "Un anillo plateado con una piedra transparente al centro.\n\nEl aro es fino y deja todo el protagonismo a la piedra.\n\nUn clásico para regalar, que se puede combinar con una alianza fina.",
    },
    images: ["ring-7.jpg"],
    priceAmount: 109_000,
    title: { en: "Silver solitaire ring", es: "Anillo solitario plateado" },
  }),
  article("anillos", {
    colors: ["plateado"],
    description: {
      en: "A thin, silver-toned band.\n\nIts slim profile makes it comfortable to wear all day.\n\nWear it alone or beside a solitaire, as in the photo.",
      es: "Una alianza fina de tono plateado.\n\nSu perfil delgado la hace cómoda para usar todo el día.\n\nUsala sola o junto a un solitario, como en la foto.",
    },
    images: ["ring-7.jpg"],
    priceAmount: 49_000,
    title: { en: "Thin silver band", es: "Alianza fina plateada" },
  }),
  article("anillos", {
    colors: ["dorado", "plateado", "oro-rosa"],
    description: {
      en: "A set of thin rings in gold, silver and rose tones.\n\nSome are plain and some have small stones, to mix as you like.\n\nStack them on one finger or spread them across both hands.",
      es: "Un set de anillos finos en tonos dorado, plateado y rosado.\n\nAlgunos son lisos y otros tienen piedritas, para mezclar a gusto.\n\nApilalos en un mismo dedo o repartilos en las dos manos.",
    },
    images: ["ring-8.jpg"],
    priceAmount: 119_000,
    title: { en: "Thin ring set", es: "Set de anillos finos" },
  }),
  article("anillos", {
    colors: ["oro-rosa"],
    description: {
      en: "A thin rose-toned ring, to add one at a time.\n\nIt is delicate and mixes well with gold and silver.\n\nA small treat to give without overthinking it.",
      es: "Un anillo fino de tono rosado, para sumar de a uno.\n\nEs delicado y se mezcla bien con dorados y plateados.\n\nUn detalle chiquito para regalar sin pensarlo mucho.",
    },
    images: ["ring-8.jpg"],
    priceAmount: 39_000,
    title: { en: "Thin rose ring", es: "Anillo fino oro rosa" },
  }),
  article("anillos", {
    colors: ["plateado"],
    description: {
      en: "A silver-toned ring shaped like a braid.\n\nThe twists in the band play with the light and give it movement.\n\nIt suits any finger, alone or beside a stone ring.",
      es: "Un anillo plateado con forma de trenza.\n\nLas vueltas del aro juegan con la luz y le dan movimiento.\n\nQueda bien en cualquier dedo, solo o junto a un anillo de piedras.",
    },
    images: ["ring-9.jpg"],
    priceAmount: 69_000,
    title: { en: "Twisted ring", es: "Anillo trenzado" },
  }),
  article("anillos", {
    colors: ["plateado"],
    description: {
      en: "A silver-toned ring covered in small clear stones.\n\nThe stones form a round face that sparkles as you move.\n\nFor a party, a wedding or a gift with some shine.",
      es: "Un anillo plateado cubierto de piedritas transparentes.\n\nLas piedras forman un frente redondo que brilla con cada movimiento.\n\nPara una fiesta, un casamiento o un regalo con brillo.",
    },
    images: ["ring-9.jpg"],
    priceAmount: 89_000,
    title: { en: "Stone cluster ring", es: "Anillo de piedras" },
  }),
];

const EARRINGS = [
  article("aros", {
    colors: ["dorado"],
    description: {
      en: "Small gold-toned stud earrings.\n\nThey are discreet and comfortable, for every day.\n\nThey pair with any other earring if you have more than one piercing.",
      es: "Aros pequeños abotonados, de tono dorado.\n\nSon discretos y cómodos, para usar todos los días.\n\nCombinan con cualquier otro aro si tenés más de una perforación.",
    },
    images: ["earrings-1.jpg"],
    priceAmount: 49_000,
    title: { en: "Gold studs", es: "Aros abotonados" },
  }),
  article("aros", {
    colors: ["dorado"],
    description: {
      en: "Chunky gold-toned hoop earrings with an even shine.\n\nTheir rounded volume catches the eye without weighing the look down.\n\nThey lift a simple outfit and work with hair down or up.",
      es: "Aros argolla gruesos, de tono dorado y brillo parejo.\n\nSu volumen redondeado llama la atención sin recargar.\n\nLe suman presencia a un look sencillo y van con el pelo suelto o atado.",
    },
    images: [
      "earrings-3.jpg",
      "earrings-8.jpg",
      "earrings-1.jpg",
      "earrings-6.jpg",
    ],
    priceAmount: 79_000,
    title: { en: "Chunky hoops", es: "Aros argolla gruesa" },
  }),
  article("aros", {
    colors: ["plateado", "blanco"],
    description: {
      en: "Crystal earrings shaped like a wreath of leaves.\n\nThe crystals sit on a silver-toned setting and catch the light with every move.\n\nMade for a night out, a party or an event.",
      es: "Aros de cristales en forma de corona de hojas.\n\nLos cristales van sobre una base plateada y reflejan la luz con cada movimiento.\n\nPensados para salir, una fiesta o un evento.",
    },
    images: ["earrings-2.jpg"],
    priceAmount: 89_000,
    title: { en: "Crystal wreath earrings", es: "Aros corona de cristal" },
  }),
  article("aros", {
    colors: ["plateado"],
    description: {
      en: "Silver-toned hoop earrings with a raised pattern.\n\nThe texture gives them a different shine from a plain hoop.\n\nWear them with light or dark clothes: silver goes with everything.",
      es: "Aros argolla de tono plateado con un trabajo en relieve.\n\nLa textura les da un brillo distinto al de una argolla lisa.\n\nUsalos con ropa clara u oscura: el plateado combina con todo.",
    },
    images: ["earrings-4.jpg"],
    priceAmount: 79_000,
    title: { en: "Silver hoops", es: "Aros argolla plateada" },
  }),
  article("aros", {
    colors: ["dorado", "blanco"],
    description: {
      en: "Flower-shaped earrings with crystal petals.\n\nThe center has a gold tone, and the clear petals sparkle in the light.\n\nA lovely gift for a special date, or to brighten an everyday look.",
      es: "Aros en forma de flor con pétalos de cristal.\n\nEl centro es de tono dorado y los pétalos transparentes brillan con la luz.\n\nUn lindo regalo para una fecha especial o para alegrar un look de todos los días.",
    },
    images: ["earrings-5.jpg"],
    priceAmount: 69_000,
    title: { en: "Crystal flower earrings", es: "Aros flor de cristal" },
  }),
  article("aros", {
    colors: ["dorado", "blanco"],
    description: {
      en: "Small butterfly-shaped stud earrings.\n\nThey have a gold tone, with white wings.\n\nDelicate and comfortable, for girls and grown-ups alike.",
      es: "Aros pequeños con forma de mariposa.\n\nSon de tono dorado, con las alas en blanco.\n\nDelicados y cómodos, ideales para chicas y grandes.",
    },
    images: ["earrings-6.jpg"],
    priceAmount: 45_000,
    title: { en: "Butterfly studs", es: "Aros mariposa" },
  }),
  article("aros", {
    colors: ["blanco"],
    description: {
      en: "Pearl-style stud earrings, white and round.\n\nThey have a soft, pearly sheen that suits everyone.\n\nA classic gift that goes with jeans as well as a dress.",
      es: "Aros abotonados estilo perla, blancos y redondos.\n\nTienen un brillo suave y nacarado que le queda bien a todos.\n\nUn clásico para regalar, que acompaña tanto un jean como un vestido.",
    },
    images: ["earrings-7.jpg"],
    priceAmount: 59_000,
    title: { en: "Pearl-style studs", es: "Aros perla" },
  }),
  article("aros", {
    colors: ["dorado"],
    description: {
      en: "Thin gold-toned hoop earrings.\n\nThey are light, so you forget you have them on.\n\nWear them alone or with small studs in the same ear.",
      es: "Aros argolla finos de tono dorado.\n\nSon livianos y se olvidan puestos.\n\nUsalos solos o con aros pequeños en la misma oreja.",
    },
    images: ["earrings-8.jpg"],
    priceAmount: 55_000,
    title: { en: "Thin hoops", es: "Aros argolla fina" },
  }),
  article("aros", {
    colors: ["dorado"],
    description: {
      en: "The small version of the gold hoops.\n\nThey keep the shine and the rounded shape, in a more discreet size.\n\nGreat for a second piercing, or for anyone who likes something subtle.",
      es: "La versión chica de las argollas doradas.\n\nMantienen el brillo y la forma redondeada, en un tamaño más discreto.\n\nIdeales para una segunda perforación o para quien prefiere algo sutil.",
    },
    images: ["earrings-3.jpg"],
    priceAmount: 49_000,
    title: { en: "Mini hoops", es: "Aros argolla mini" },
  }),
  article("aros", {
    colors: ["blanco"],
    description: {
      en: "Pearl-style studs in a mini size.\n\nThey are white, round and very light.\n\nAn ideal first pair of earrings to give a little girl.",
      es: "Aros estilo perla en tamaño mini.\n\nSon blancos, redondos y muy livianos.\n\nUn primer par de aros ideal para regalarle a una nena.",
    },
    images: ["earrings-7.jpg"],
    priceAmount: 45_000,
    title: { en: "Mini pearl-style studs", es: "Aros perla mini" },
  }),
  article("aros", {
    colors: ["plateado"],
    description: {
      en: "The small version of the textured silver hoops.\n\nThey keep the texture that gives them their shine, in a discreet size.\n\nPerfect for every day, or to combine with other earrings.",
      es: "La versión chica de las argollas plateadas con relieve.\n\nConservan la textura que les da brillo, en un tamaño discreto.\n\nPerfectas para el día a día o para combinar con otros aros.",
    },
    images: ["earrings-4.jpg"],
    priceAmount: 59_000,
    title: { en: "Mini silver hoops", es: "Aros argolla plateada mini" },
  }),
];

const BRACELETS = [
  article("pulseras", {
    colors: ["dorado"],
    description: {
      en: "A pair of gold-toned bangles.\n\nThey are rigid and smooth, with an even shine you notice from afar.\n\nWear them together, so they chime as you move, or one on each wrist.",
      es: "Un par de esclavas de tono dorado.\n\nSon rígidas y lisas, con un brillo parejo que se nota de lejos.\n\nUsalas juntas, para que suenen al moverse, o una en cada muñeca.",
    },
    images: [
      "bracelet-2.jpg",
      "bracelet-4.jpg",
      "bracelet-3.jpg",
      "necklace-4.jpg",
    ],
    priceAmount: 129_000,
    title: { en: "Bangle pair", es: "Par de esclavas" },
  }),
  article("pulseras", {
    colors: ["dorado"],
    description: {
      en: "A fine bracelet with an ID tag at its center.\n\nIt has a gold tone, and the tag is plain, to engrave with a name, a date or an initial.\n\nA personal gift for someone special.",
      es: "Una pulsera fina con una chapita al centro.\n\nEs de tono dorado y la chapita es lisa, para grabarle un nombre, una fecha o una inicial.\n\nUn regalo personal para alguien especial.",
    },
    images: ["bracelet-1.jpg"],
    priceAmount: 69_000,
    title: { en: "ID bracelet", es: "Pulsera chapita" },
  }),
  article("pulseras", {
    colors: ["dorado"],
    description: {
      en: "A bracelet of oval gold-toned links with a bar clasp.\n\nThe open links make it light and eye-catching at once.\n\nWear it alone or beside a bangle, or give it with a chain of the same tone.",
      es: "Una pulsera de eslabones ovalados de tono dorado, con cierre de barra.\n\nLos eslabones abiertos la hacen liviana y llamativa a la vez.\n\nUsala sola o junto a una esclava, o regalala con una cadena del mismo tono.",
    },
    images: [
      "bracelet-6.jpg",
      "bracelet-5.jpg",
      "necklace-4.jpg",
      "bracelet-7.jpg",
    ],
    priceAmount: 89_000,
    title: { en: "Link bracelet", es: "Pulsera eslabones" },
  }),
  article("pulseras", {
    colors: ["dorado"],
    description: {
      en: "Two textured bangles in a soft gold tone.\n\nThe raised surface gives them a muted, elegant shine, unlike a smooth bangle.\n\nPair them with a light shirt or a sweater for an understated look.",
      es: "Dos esclavas con textura, en un tono dorado suave.\n\nEl relieve les da un brillo apagado y elegante, distinto al de una esclava lisa.\n\nCombinalas con una camisa clara o un buzo tejido para un look sobrio.",
    },
    images: ["bracelet-3.jpg"],
    priceAmount: 119_000,
    title: { en: "Textured bangles", es: "Esclavas texturadas" },
  }),
  article("pulseras", {
    colors: ["dorado"],
    description: {
      en: "A slim, smooth gold-toned bangle.\n\nIts simple shape makes it easy to pair with other bracelets.\n\nAdd one at a time, or build your own stack with several.",
      es: "Una esclava fina y lisa, de tono dorado.\n\nSu forma simple la hace fácil de combinar con otras pulseras.\n\nSumala de a una o armá tu propio juego con varias.",
    },
    images: ["bracelet-4.jpg"],
    priceAmount: 69_000,
    title: { en: "Plain bangle", es: "Esclava lisa" },
  }),
  article("pulseras", {
    colors: ["dorado"],
    description: {
      en: "A chunky bracelet of gold-toned chain links.\n\nIt has visual weight and shine while staying comfortable.\n\nIt looks great with a tee, rolled-up sleeves or a sweatshirt.",
      es: "Una pulsera de cadena gruesa, de eslabones dorados.\n\nTiene presencia y brillo sin dejar de ser cómoda.\n\nQueda muy bien con remera, con camisa arremangada o con buzo.",
    },
    images: ["bracelet-5.jpg"],
    priceAmount: 99_000,
    title: { en: "Chunky chain bracelet", es: "Pulsera cadena gruesa" },
  }),
  article("pulseras", {
    colors: ["plateado"],
    description: {
      en: "A silver-toned chain bracelet with tag-shaped charms.\n\nThe charms hang and move with your wrist.\n\nA fun gift for a friend, or a treat for yourself.",
      es: "Una pulsera de cadena plateada con dijes en forma de chapita.\n\nLos dijes cuelgan y se mueven con la muñeca.\n\nUn regalo con onda para una amiga, o un gusto para vos.",
    },
    images: ["bracelet-7.jpg"],
    priceAmount: 79_000,
    title: { en: "Charm bracelet", es: "Pulsera dijes" },
  }),
  article("pulseras", {
    colors: ["plateado", "blanco"],
    description: {
      en: "A silver-toned bracelet set with clear crystals.\n\nLarge and small crystals alternate and sparkle with every move.\n\nFor a party, a wedding or a gift that stands out.",
      es: "Una pulsera de tono plateado con cristales transparentes engarzados.\n\nLos cristales grandes y chicos se alternan y brillan con cada movimiento.\n\nPara una fiesta, un casamiento o un regalo que se luzca.",
    },
    images: ["bracelet-8.jpg"],
    priceAmount: 129_000,
    title: { en: "Crystal bracelet", es: "Pulsera cristales" },
  }),
  article("pulseras", {
    colors: ["dorado"],
    description: {
      en: "A gold-toned bangle with a raised pattern.\n\nThe texture gives it a shine that changes with the light.\n\nAdd it to your bracelets, or give it with the chain of the same design.",
      es: "Una esclava de tono dorado con un trabajo en relieve.\n\nLa textura le da un brillo que cambia con la luz.\n\nSumala a tus pulseras o regalala junto a la cadena del mismo diseño.",
    },
    images: ["necklace-4.jpg"],
    priceAmount: 79_000,
    title: { en: "Textured bangle", es: "Esclava trabajada" },
  }),
  article("pulseras", {
    colors: ["dorado"],
    description: {
      en: "A very fine gold-toned chain bracelet.\n\nIt is light, and you barely feel it on.\n\nWear it alone or layered with other fine bracelets.",
      es: "Una pulsera de cadena bien fina, de tono dorado.\n\nEs liviana y casi no se siente puesta.\n\nUsala sola o en capas con otras pulseras finas.",
    },
    images: ["bracelet-1.jpg"],
    priceAmount: 49_000,
    title: { en: "Fine chain bracelet", es: "Pulsera cadena fina" },
  }),
];

/**
 * `lists` taken one item of each in turn, while any has one left: the
 * order the sample articles are created in.
 */
export function inTurns<T>(lists: readonly (readonly T[])[]): T[] {
  const longest = Math.max(0, ...lists.map((list) => list.length));

  return Array.from({ length: longest }, (_, index) =>
    lists.flatMap((list) => {
      const item = list[index];
      return item === undefined ? [] : [item];
    })
  ).flat();
}

/**
 * Lucas's sample articles (FER-010, FER-044): about fifty over the five
 * categories, with realistic names and prices in pesos, one sold out so
 * that state has a row to show, and seven with four or five photos so the
 * article page's gallery has something to slide through. They are created
 * one category after another in turn, so the catalog's default order (the
 * order they were added, FER-044) mixes them.
 */
export const SEED_ARTICLES: SeedArticle[] = inTurns([
  BUBBLE_GUNS,
  CHAINS,
  RINGS,
  EARRINGS,
  BRACELETS,
]);

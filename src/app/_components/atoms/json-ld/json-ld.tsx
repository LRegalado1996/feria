export interface JsonLdProps {
  /** One or more schema.org objects, built from what the page shows. */
  data: object | object[];
}

/**
 * schema.org structured data for search engines and assistants (FER-024).
 * React writes a script's text as it is, so the JSON stays valid; every `<`
 * is escaped first, so no value (an article's title, a store's name) can
 * close the script element or open another.
 */
function JsonLd({ data }: JsonLdProps) {
  return (
    <script data-slot="json-ld" type="application/ld+json">
      {JSON.stringify(data).replaceAll("<", String.raw`\u003c`)}
    </script>
  );
}

export { JsonLd };

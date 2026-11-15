import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { JsonLd, type JsonLdProps } from "./json-ld";

function setup(data: JsonLdProps["data"]) {
  const { container } = render(<JsonLd data={data} />);
  const script = container.querySelector("script");

  if (!script) {
    throw new Error("No script rendered");
  }

  return { container, script, text: script.textContent ?? "" };
}

function makeProduct(name: string) {
  return { "@context": "https://schema.org", "@type": "Product", name };
}

describe("JsonLd", () => {
  test("writes one object as the text of a JSON-LD script", () => {
    const { script, text } = setup(makeProduct("Collar de perlas"));

    expect(script).toHaveAttribute("type", "application/ld+json");
    expect(script).toHaveAttribute("data-slot", "json-ld");
    expect(JSON.parse(text)).toEqual(makeProduct("Collar de perlas"));
  });

  test("writes a list of objects as one array", () => {
    const { text } = setup([makeProduct("Aros"), { "@type": "Organization" }]);

    expect(JSON.parse(text)).toEqual([
      makeProduct("Aros"),
      { "@type": "Organization" },
    ]);
  });

  test("escapes every < so a value cannot close the script, and still reads back the same", () => {
    const title = 'Collar </script><img src=x onerror="alert(1)"> <b>';
    const { container, text } = setup(makeProduct(title));

    expect(text).not.toContain("<");
    expect(text).toContain(String.raw`\u003c/script>\u003cimg`);
    expect(JSON.parse(text)).toEqual(makeProduct(title));
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelectorAll("script")).toHaveLength(1);
  });
});

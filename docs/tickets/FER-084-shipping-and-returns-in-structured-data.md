# FER-084 Shipping and returns in an article's structured data

- **Milestone:** M4 Storefront and orders
- **Priority:** P2
- **Status:** todo
- **Depends on:** FER-032

## Goal

Google's merchant listings show an article with what it costs to get it and whether it can be returned, as they do for the shops beside it.

## The problem

Found on 2026-11-25 while checking FER-032's structured data. Google's Rich Results Test on `https://market.lucasregalado.com/productos/cadena-1-nina` finds three valid items (product snippet, merchant listing, breadcrumb), and two optional fields missing from the `Offer`: `shippingDetails` and `hasMerchantReturnPolicy`. The `Product` itself matches the page: name, photos, price in UYU and availability, on three articles in both languages.

## Scope

- Lucas decides what is true first: how an order reaches the shopper (pickup at the fair, delivery in Montevideo, shipping to the rest of Uruguay) and at what cost, and whether and for how long an article can be returned.
- The answer becomes `shippingDetails` (`OfferShippingDetails`: rate, destination `UY`, handling and transit times) and `hasMerchantReturnPolicy` (`MerchantReturnPolicy`) on every article's `Offer` (`src/lib/seo/structured-data.ts`), or once on the `Organization` if Google accepts it there for this case. Whatever is stated is also said on the page (the how-to-buy block, the contact page): structured data never says what the visitor cannot read.

## Acceptance criteria

- The Rich Results Test on an article shows no missing optional field for the merchant listing, or the ticket says why one stays out.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.

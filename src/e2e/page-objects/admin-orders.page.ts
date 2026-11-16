import { expect, type Locator } from "@playwright/test";

import { completeRpcAction } from "../fixtures/complete-rpc-action";
import { AdminPage } from "./admin.page";

// The admin reads in Spanish, the language of an unprefixed URL.

type OrderMove = "delivered" | "packed" | "received" | "undeliverable";

/** The store's orders (`/admin/orders`, FER-027) and an order's page. */
export class AdminOrdersPage extends AdminPage {
  /**
   * Opens the list with `query` (`?status=…&q=…`) and waits until React owns
   * it: the sound switch is enabled only once the screen read the staff's
   * preference, after it hydrated. A row tapped from here navigates on the
   * client, so the order's page arrives already owned by React.
   */
  async open(query = ""): Promise<void> {
    await this.goto(`/admin/orders${query}`);
    await expect(this.heading()).toHaveText("Pedidos");
    await expect(
      this.page.getByRole("button", { name: "Sonido cuando llega un pedido" })
    ).toBeEnabled();
  }

  /** A row of the list, by the order's code. */
  row(code: string): Locator {
    return this.getByTestId(`order-row-${code}`);
  }

  /**
   * Taps a row of the list and waits for the order's page. An order opened
   * before stays mounted and hidden (the router keeps pages left behind), so
   * the page is the visible one.
   */
  async openOrder(code: string): Promise<void> {
    await this.row(code).getByRole("link").click();
    await expect(
      this.getByTestId("order-detail").filter({ visible: true })
    ).toBeVisible();
    await expect(
      this.page.getByRole("heading", { level: 1, name: `Pedido ${code}` })
    ).toBeVisible();
  }

  /** Taps one of the order's moves and waits for the server to take it. */
  async move(label: string, status: OrderMove): Promise<void> {
    await completeRpcAction(
      this.page,
      "/api/orpc/order/changeStatus",
      async () => {
        await this.getButton(label).click();
      },
      { input: { status } }
    );
  }

  /** The order page's history, one line per status: "<status><who>…". */
  historyLines(): Locator {
    return this.getByTestId("order-history").getByRole("listitem");
  }

  /** A tab of the list, by its whole label with the count. */
  tab(name: string): Locator {
    return this.page
      .getByRole("navigation", { name: "Filtrar por estado" })
      .getByRole("link", { exact: true, name });
  }

  search(): Locator {
    return this.page.getByLabel("Buscar pedidos");
  }

  /** The way back from an order's page to the list it was opened from. */
  backToList(): Locator {
    return this.page.getByRole("link", { name: "Volver a pedidos" });
  }
}

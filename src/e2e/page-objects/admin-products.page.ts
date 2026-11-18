import { expect, type Locator } from "@playwright/test";

import { AdminPage } from "./admin.page";

/**
 * The admin's article list (FER-019), read in Spanish: its toolbar (search,
 * "Filtros", "Ordenar"), the chips of the active filters, the table and its
 * pages. After a navigation the page left behind stays mounted, hidden, so
 * every locator keeps to the visible list.
 */
export class AdminProductsPage extends AdminPage {
  /** The list at `search` (`?q=…&page=2`, or nothing). */
  async goto(search = ""): Promise<void> {
    await this.page.goto(`/admin/products${search}`);
    await this.waitForLoad();
  }

  protected loaded(): Locator {
    return this.list().getByTestId("product-list-count");
  }

  list(): Locator {
    return this.getByTestId("product-list").filter({ visible: true });
  }

  searchField(): Locator {
    return this.list().getByRole("searchbox", { name: "Buscar artículos" });
  }

  clearSearch(): Locator {
    return this.list().getByRole("button", { name: "Borrar la búsqueda" });
  }

  /** "Filtros", whose name carries how many filters are active. */
  filtersButton(): Locator {
    return this.list().getByTestId("product-filters-button");
  }

  sheet(): Locator {
    return this.page.getByRole("dialog", { name: "Filtros" });
  }

  /**
   * A value's checkbox in the sheet, inside its own filter (keyed by the
   * filter's slug): the sheet lists every filter of the store, whose values
   * parallel specs name alike ("Dorado").
   */
  filterValue(attribute: string, value: string): Locator {
    return this.sheet()
      .getByTestId(`filter-attribute-${attribute}`)
      .getByRole("checkbox", { name: value, exact: true });
  }

  /**
   * A status's pill in the sheet: the label a finger taps, around a radio
   * hidden for the eye.
   */
  statusChoice(name: string): Locator {
    return this.sheet()
      .getByRole("group", { name: "Estado" })
      .getByText(name, { exact: true });
  }

  /** Opens the filter sheet: the first harmless open after a load. */
  async openFilters(): Promise<void> {
    await this.clickUntilVisible(this.filtersButton(), this.sheet());
  }

  sortButton(): Locator {
    return this.list().getByTestId("product-sort-button");
  }

  sortMenu(): Locator {
    // Its content is portalled out of the list, so it is found on the page.
    return this.page.getByTestId("product-sort-menu");
  }

  /** Opens "Ordenar" (below `xl`): the first harmless open after a load. */
  async openSortMenu(): Promise<void> {
    await this.clickUntilVisible(this.sortButton(), this.sortMenu());
  }

  /** A column's sort link in the table's head (from `xl` up). */
  sortHeader(sort: string): Locator {
    return this.list().getByTestId(`sort-${sort}`);
  }

  /** The column header holding a sort link, which carries `aria-sort`. */
  columnHeader(sort: string): Locator {
    return this.list()
      .getByRole("columnheader")
      .filter({
        // `has` resolves from each header: a locator of its own, not the
        // list's (`sortHeader`), which no header holds.
        has: this.page.getByTestId(`sort-${sort}`),
      });
  }

  chips(): Locator {
    return this.list().getByRole("list", { name: "Filtros activos" });
  }

  count(): Locator {
    return this.list().getByTestId("product-list-count");
  }

  range(): Locator {
    return this.list().getByTestId("product-list-range");
  }

  table(): Locator {
    return this.list().getByTestId("product-list-table");
  }

  pages(): Locator {
    return this.list().getByRole("navigation", { name: "Páginas" });
  }

  /** Waits for the rows to be exactly `titles`, in order. */
  async expectTitles(titles: string[]): Promise<void> {
    await expect(this.list().getByTestId("product-row-title")).toHaveText(
      titles
    );
  }
}

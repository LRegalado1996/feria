import { expect, type Locator } from "@playwright/test";

import { completeRpcAction } from "../fixtures/complete-rpc-action";
import { expectDialogRemoved } from "../fixtures/expect-dialog-removed";
import { BasePage } from "./base.page";

// The specs read the interface in Spanish, the language of an unprefixed URL
// and what most visitors get. English has its own spec (`tests/i18n.e2e.ts`).
const SWITCH_TO_SIGN_UP_PATTERN = /¿No tenés una cuenta\? Registrate/i;
const SWITCH_TO_SIGN_IN_PATTERN = /¿Ya tenés una cuenta\? Iniciá sesión/i;

export class HomePage extends BasePage {
  async goto(): Promise<void> {
    await this.page.goto("/");
    await this.waitForLoad();
  }

  /** Signed in, the navbar; signed out, the sign-in page's heading. */
  protected loaded(): Locator {
    // A streamed reload can briefly hold a second, hidden navbar.
    return this.getByTestId("navbar")
      .or(this.page.getByRole("heading", { name: "Hola de nuevo" }))
      .filter({ visible: true })
      .first();
  }

  // ── Auth Form ───────────────────────────────────────────────

  async fillEmail(email: string): Promise<void> {
    await this.fillField("Email", email);
  }

  async fillPassword(password: string): Promise<void> {
    await this.fillField("Contraseña", password);
  }

  async fillName(name: string): Promise<void> {
    await this.fillField("Nombre", name);
  }

  /**
   * The submit button stays disabled until React owns the form, so it being
   * enabled is the proof that typing and submitting now reach React.
   */
  async waitForAuthForm(
    mode: "Crear cuenta" | "Iniciar sesión" = "Iniciar sesión"
  ): Promise<void> {
    await expect(this.getButton(mode)).toBeEnabled();
  }

  /** A click that the form refuses before sending anything (validation). */
  async submitSignIn(): Promise<void> {
    await this.getButton("Iniciar sesión").click();
  }

  async submitSignUp(): Promise<void> {
    await this.getButton("Crear cuenta").click();
  }

  async switchToSignUp(): Promise<void> {
    await this.clickUntilVisible(
      this.getButton(SWITCH_TO_SIGN_UP_PATTERN),
      this.getInput("Nombre")
    );
  }

  async switchToSignIn(): Promise<void> {
    await this.clickUntilVisible(
      this.getButton(SWITCH_TO_SIGN_IN_PATTERN),
      this.getButton("Iniciar sesión")
    );
  }

  /** Signs in and waits for Better Auth's answer, `status` (200 by default). */
  async signIn(email: string, password: string, status = 200): Promise<void> {
    await this.waitForAuthForm();
    await this.fillEmail(email);
    await this.fillPassword(password);
    // A submit is never retried: a lost one fails here, at the request.
    await completeRpcAction(
      this.page,
      "/api/auth/sign-in/email",
      async () => {
        await this.submitSignIn();
      },
      { input: { email }, status }
    );
  }

  /** Signs up and waits for Better Auth's answer, `status` (200 by default). */
  async signUp(
    name: string,
    email: string,
    password: string,
    status = 200
  ): Promise<void> {
    await this.switchToSignUp();
    await this.fillName(name);
    await this.fillEmail(email);
    await this.fillPassword(password);
    await completeRpcAction(
      this.page,
      "/api/auth/sign-up/email",
      async () => {
        await this.submitSignUp();
      },
      { input: { email }, status }
    );
  }

  async signOut(): Promise<void> {
    // Signing out twice changes nothing, so a click lost before hydration is
    // safe to repeat until the sign-in page shows.
    await this.clickUntilVisible(
      this.getButton("Cerrar sesión").filter({ visible: true }),
      this.page.getByRole("heading", { name: "Hola de nuevo" })
    );
  }

  /** Opens a post's row menu and its delete confirmation. */
  async openDeleteDialog(id: number): Promise<void> {
    await this.clickUntilVisible(
      this.getByTestId(`post-actions-${id}`),
      this.getByTestId(`post-actions-${id}-delete`)
    );
    await this.getByTestId(`post-actions-${id}-delete`).click();
    await expect(this.getByTestId("confirm-dialog")).toBeVisible();
    await expect(this.getByTestId("dialog-overlay")).toBeVisible();
  }

  async deletePost(id: number): Promise<void> {
    await this.openDeleteDialog(id);
    await completeRpcAction(
      this.page,
      "/api/orpc/post/delete",
      async () => {
        await this.getByTestId("confirm-dialog-confirm").click();
      },
      { input: { id } }
    );
    await expectDialogRemoved(this.page, this.getByTestId("confirm-dialog"));
  }

  async cancelDeleteDialog(): Promise<void> {
    await this.page.getByRole("button", { name: "Cancelar" }).click();
    await expectDialogRemoved(this.page, this.getByTestId("confirm-dialog"));
  }

  async chooseTheme(theme: "Claro" | "Oscuro" | "Sistema"): Promise<void> {
    // Right after a reload the streamed page can briefly hold a second,
    // hidden copy of the navbar; the visible one is the one a user presses.
    const option = this.page.getByRole("menuitemradio", { name: theme });
    await this.clickUntilVisible(
      this.getByTestId("theme-toggle").filter({ visible: true }),
      option
    );
    await option.click();
  }

  // ── Language ────────────────────────────────────────────────

  /**
   * The link to this page in the other language. After a switch the page
   * left behind stays mounted, hidden, with a toggle of its own: the visible
   * one is the one a user presses.
   */
  getLocaleToggle(): Locator {
    return this.getByTestId("locale-toggle").filter({ visible: true });
  }

  /** The document's language, which screen readers and search engines read. */
  async expectDocumentLanguage(lang: "en" | "es"): Promise<void> {
    await expect(this.page.locator("html")).toHaveAttribute("lang", lang);
  }

  // ── Post Form ───────────────────────────────────────────────

  getComposeBox(): Locator {
    return this.page.getByRole("textbox", { name: "Nueva publicación" });
  }

  /**
   * Types into the compose box until React has it: the Publicar button enables
   * only once React holds the text, and text typed before hydration is lost
   * to it. Filling again is harmless; submitting twice would not be.
   */
  async fillPostContent(content: string): Promise<void> {
    await expect(async () => {
      await this.getComposeBox().fill(content);
      await expect(this.getButton("Publicar")).toBeEnabled({ timeout: 1000 });
    }).toPass();
  }

  async submitPost(): Promise<void> {
    await this.getButton("Publicar").click();
  }

  /** Posts `content` and waits until the saved post is in the feed. */
  async createPost(content: string): Promise<void> {
    await this.fillPostContent(content);
    await completeRpcAction(
      this.page,
      "/api/orpc/post/create",
      async () => {
        await this.submitPost();
      },
      { input: { name: content } }
    );
    // The box clears only once the server has saved the post; until then it
    // still holds the text, so the card is looked for inside the feed.
    await expect(this.getComposeBox()).toHaveValue("");
    await expect(this.getPostCards(content)).toHaveCount(1);
  }

  // ── Assertions ──────────────────────────────────────────────

  async expectUnauthenticated(): Promise<void> {
    await this.expectHeading("Hola de nuevo");
    await expect(
      this.page.getByText("Iniciá sesión en tu cuenta para continuar")
    ).toBeVisible();
  }

  async expectAuthenticated(userName: string): Promise<void> {
    await expect(this.getByTestId("navbar")).toBeVisible();
    await expect(this.getByTestId("navbar").getByText(userName)).toBeVisible();
    await expect(this.getButton("Cerrar sesión")).toBeVisible();
  }

  /** Cards whose text contains `text`: a spec's own posts, by their unique names. */
  getPostCards(text: string): Locator {
    return this.getByTestId("post-card").filter({ hasText: text });
  }

  /**
   * The feed is shared with every parallel worker, so a spec looks for its
   * own post by its unique name, never at a position.
   */
  async expectPost(postName: string): Promise<void> {
    await expect(this.getPostCards(postName)).toBeVisible();
  }

  async expectNoPosts(): Promise<void> {
    await expect(this.getByTestId("empty-state")).toBeVisible();
  }

  async expectAuthError(message: string | RegExp): Promise<void> {
    await expect(this.getByTestId("auth-error")).toContainText(message);
  }

  async expectFieldError(message: string | RegExp): Promise<void> {
    await expect(
      this.getByTestId("form-message").getByText(message)
    ).toBeVisible();
  }

  async expectPostFormVisible(): Promise<void> {
    await expect(this.getByTestId("compose-area")).toBeVisible();
    await expect(this.getButton("Publicar")).toBeVisible();
  }

  // ── Feed / Pagination ──────────────────────────────────────

  async getPostCount(): Promise<number> {
    return await this.getByTestId("post-card").count();
  }

  async scrollToBottom(): Promise<void> {
    await this.page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
  }

  async waitForPostCount(count: number): Promise<void> {
    await expect(this.getByTestId("post-card")).toHaveCount(count, {
      timeout: 15_000,
    });
  }

  async waitForMinimumPosts(min: number): Promise<void> {
    await expect(async () => {
      const count = await this.getPostCount();
      expect(count).toBeGreaterThanOrEqual(min);
    }).toPass({ timeout: 15_000 });
  }
}

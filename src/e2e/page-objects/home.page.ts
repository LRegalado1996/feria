import { expect, type Locator } from "@playwright/test";

import { completeRpcAction } from "../fixtures/complete-rpc-action";
import { expectDialogRemoved } from "../fixtures/expect-dialog-removed";
import { BasePage } from "./base.page";

const SWITCH_TO_SIGN_UP_PATTERN = /Don't have an account\? Sign Up/i;
const SWITCH_TO_SIGN_IN_PATTERN = /Already have an account\? Sign In/i;

export class HomePage extends BasePage {
  async goto(): Promise<void> {
    await this.page.goto("/");
    await this.waitForLoad();
  }

  /** Signed in, the navbar; signed out, the sign-in page's heading. */
  protected loaded(): Locator {
    // A streamed reload can briefly hold a second, hidden navbar.
    return this.getByTestId("navbar")
      .or(this.page.getByRole("heading", { name: "Welcome back" }))
      .filter({ visible: true })
      .first();
  }

  // ── Auth Form ───────────────────────────────────────────────

  async fillEmail(email: string): Promise<void> {
    await this.fillField("Email", email);
  }

  async fillPassword(password: string): Promise<void> {
    await this.fillField("Password", password);
  }

  async fillName(name: string): Promise<void> {
    await this.fillField("Name", name);
  }

  /**
   * The submit button stays disabled until React owns the form, so it being
   * enabled is the proof that typing and submitting now reach React.
   */
  async waitForAuthForm(
    mode: "Sign In" | "Sign Up" = "Sign In"
  ): Promise<void> {
    await expect(this.getButton(mode)).toBeEnabled();
  }

  /** A click that the form refuses before sending anything (validation). */
  async submitSignIn(): Promise<void> {
    await this.getButton("Sign In").click();
  }

  async submitSignUp(): Promise<void> {
    await this.getButton("Sign Up").click();
  }

  async switchToSignUp(): Promise<void> {
    await this.clickUntilVisible(
      this.getButton(SWITCH_TO_SIGN_UP_PATTERN),
      this.getInput("Name")
    );
  }

  async switchToSignIn(): Promise<void> {
    await this.clickUntilVisible(
      this.getButton(SWITCH_TO_SIGN_IN_PATTERN),
      this.getButton("Sign In")
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
      this.getButton("Sign out").filter({ visible: true }),
      this.page.getByRole("heading", { name: "Welcome back" })
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
    await this.page.getByRole("button", { name: "Cancel" }).click();
    await expectDialogRemoved(this.page, this.getByTestId("confirm-dialog"));
  }

  async chooseTheme(theme: "Dark" | "Light" | "System"): Promise<void> {
    // Right after a reload the streamed page can briefly hold a second,
    // hidden copy of the navbar; the visible one is the one a user presses.
    const option = this.page.getByRole("menuitemradio", { name: theme });
    await this.clickUntilVisible(
      this.getByTestId("theme-toggle").filter({ visible: true }),
      option
    );
    await option.click();
  }

  // ── Post Form ───────────────────────────────────────────────

  getComposeBox(): Locator {
    return this.page.getByRole("textbox", { name: "New post" });
  }

  /**
   * Types into the compose box until React has it: the Post button enables
   * only once React holds the text, and text typed before hydration is lost
   * to it. Filling again is harmless; submitting twice would not be.
   */
  async fillPostContent(content: string): Promise<void> {
    await expect(async () => {
      await this.getComposeBox().fill(content);
      await expect(this.getButton("Post")).toBeEnabled({ timeout: 1000 });
    }).toPass();
  }

  async submitPost(): Promise<void> {
    await this.getButton("Post").click();
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
    await this.expectHeading("Welcome back");
    await expect(
      this.page.getByText("Sign in to your account to continue")
    ).toBeVisible();
  }

  async expectAuthenticated(userName: string): Promise<void> {
    await expect(this.getByTestId("navbar")).toBeVisible();
    await expect(this.getByTestId("navbar").getByText(userName)).toBeVisible();
    await expect(this.getButton("Sign out")).toBeVisible();
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
    await expect(this.getButton("Post")).toBeVisible();
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

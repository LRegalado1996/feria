import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, test } from "vitest";

import { Input } from "@/app/_components/atoms/input";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./form";

function EmailField({ error }: { error?: string }) {
  const form = useForm({ defaultValues: { email: "" } });

  if (error) {
    form.setError("email", { message: error });
  }

  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem className="custom-item" data-testid="form-item">
            <FormLabel>Email</FormLabel>
            <FormControl>
              <Input {...field} />
            </FormControl>
            <FormDescription>We never share it.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <output data-testid="form-value">{form.watch("email")}</output>
    </Form>
  );
}

function setup(error?: string) {
  const user = userEvent.setup();
  render(<EmailField error={error} />);

  return { input: screen.getByLabelText("Email"), user };
}

describe("Form", () => {
  test("lays out a field with its slots, label bound to the control", () => {
    const { input } = setup();

    const item = screen.getByTestId("form-item");
    expect(item).toHaveAttribute("data-slot", "form-item");
    expect(item).toHaveClass("grid", "gap-2", "custom-item");
    expect(input).toHaveAttribute("data-slot", "form-control");
    expect(screen.getByText("Email")).toHaveAttribute(
      "data-slot",
      "form-label"
    );
    expect(screen.getByText("We never share it.")).toHaveAttribute(
      "data-slot",
      "form-description"
    );
  });

  test("a valid field points at its description only and shows no message", () => {
    const { input } = setup();

    const description = screen.getByText("We never share it.");
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(input).toHaveAttribute("aria-describedby", description.id);
    expect(screen.getByText("Email")).toHaveAttribute("data-error", "false");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("an invalid field announces its error and points the control at it", () => {
    const { input } = setup("Please enter a valid email");

    const message = screen.getByRole("alert");
    expect(message).toHaveTextContent("Please enter a valid email");
    expect(message).toHaveAttribute("data-slot", "form-message");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(
      "We never share it. Please enter a valid email"
    );
    expect(screen.getByText("Email")).toHaveAttribute("data-error", "true");
  });

  test("binds what the user types to the form", async () => {
    const { input, user } = setup();

    await user.type(input, "ada@example.com");

    expect(input).toHaveValue("ada@example.com");
    expect(screen.getByTestId("form-value")).toHaveTextContent(
      "ada@example.com"
    );
  });
});

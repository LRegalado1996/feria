"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFormState, useWatch } from "react-hook-form";
import { toast } from "sonner";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/app/_components/atoms/avatar";
import { Button } from "@/app/_components/atoms/button";
import { Textarea } from "@/app/_components/atoms/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/app/_components/molecules/form";
import { reportError } from "@/lib/errors/client";
import {
  type CreatePostValues,
  createPostSchema,
  POST_NAME_MAX_LENGTH,
} from "@/lib/schemas/post";
import { getInitial } from "@/lib/utils/get-initial";

export interface ComposeBoxProps {
  currentUser: { name: string; image: string | null };
  /** Resolves once the post is saved; rejects when it was not. */
  onSubmit: (values: CreatePostValues) => Promise<unknown>;
}

function ComposeBox({ currentUser, onSubmit }: ComposeBoxProps) {
  const form = useForm<CreatePostValues>({
    resolver: zodResolver(createPostSchema),
    defaultValues: { name: "" },
  });
  // Hooks, not `form.formState`/`form.watch()`: the React Compiler memoizes a
  // read off the stable `form` object, and the button would never update.
  const { isSubmitting } = useFormState({ control: form.control });
  const nameValue = useWatch({ control: form.control, name: "name" });

  const handleFormSubmit = async (values: CreatePostValues) => {
    try {
      await onSubmit(values);
      // Only now: a failed post keeps what the user typed.
      form.reset();
    } catch (error) {
      // The create mutation leaves reporting to this catch (its meta), so a
      // failure is reported once.
      reportError(error, { action: "Post.create" });
      toast.error("Your post was not published. Try again.");
    }
  };

  return (
    <Form {...form}>
      <form
        className="flex gap-3 border-b p-4"
        data-slot="compose-box"
        data-testid="compose-area"
        onSubmit={(event) => {
          void form.handleSubmit(handleFormSubmit)(event);
        }}
      >
        <Avatar data-testid="compose-avatar">
          {currentUser.image ? (
            <AvatarImage alt={currentUser.name} src={currentUser.image} />
          ) : null}
          <AvatarFallback>{getInitial(currentUser.name)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="sr-only">New post</FormLabel>
                <FormControl>
                  <Textarea
                    className="resize-none border-0 shadow-none"
                    maxLength={POST_NAME_MAX_LENGTH}
                    placeholder="What's happening?"
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <div className="flex justify-end">
            <Button
              className="rounded-full"
              disabled={isSubmitting || !nameValue.trim()}
              size="sm"
              type="submit"
            >
              {isSubmitting ? "Posting…" : "Post"}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}

export { ComposeBox };

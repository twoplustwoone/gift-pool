/**
 * @vitest-environment jsdom
 */
import { createRemixStub } from "@remix-run/testing";
import { render, screen } from "@testing-library/react";
import { vi, describe, it } from "vitest";
import { Wishlist } from "./index";

vi.mock("#app/utils/user.ts", async () => {
  const actual =
    await vi.importActual<typeof import("#app/utils/user.ts")>(
      "#app/utils/user.ts",
    );
  return {
    ...actual,
    useOptionalUser: () => ({ id: "user1", roles: [] }),
    userHasPermission: () => true,
  };
});

vi.mock("#app/utils/misc.tsx", async () => {
  const actual = await vi.importActual<typeof import("#app/utils/misc.tsx")>(
    "#app/utils/misc.tsx",
  );
  return {
    ...actual,
    useIsPending: () => false,
  };
});

vi.mock("@remix-run/react", async () => {
  const actual =
    await vi.importActual<typeof import("@remix-run/react")>(
      "@remix-run/react",
    );
  return {
    ...actual,
    useActionData: () => undefined,
    useFetcher: () => ({ Form: (props: any) => <form {...props} /> }),
  };
});

vi.mock("#app/routes/wishlist+/__wishlist-item-editor", () => ({
  WishlistItemEditor: () => <div>editor</div>,
}));

describe("Wishlist components", () => {
  it("renders wishlist with items", async () => {
    const App = createRemixStub([
      {
        path: "/",
        Component: () => (
          <Wishlist
            isOwner={true}
            user={{
              username: "jane",
              name: "Jane",
              image: { id: "img1" },
              wishlistItems: [{ id: "1", title: "Item one", ownerId: "user1" }],
            }}
          />
        ),
      },
    ]);

    render(<App />);

    await screen.findByText("Jane's Wishlist");
    await screen.findByText("Item one");
  });

  it("shows empty message for others", async () => {
    const App = createRemixStub([
      {
        path: "/",
        Component: () => (
          <Wishlist
            isOwner={false}
            user={{
              username: "jim",
              name: "Jim",
              image: { id: "img1" },
              wishlistItems: [],
            }}
          />
        ),
      },
    ]);

    render(<App />);

    await screen.findByText(
      "Jim doesn't have any items in their wishlist yet!",
    );
  });
});

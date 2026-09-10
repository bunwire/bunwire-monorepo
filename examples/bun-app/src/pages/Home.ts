import { createElement } from "react";
import { Link, usePage, type BunwirePage } from "@bunwire/bun/react";

interface HomeProps {
  readonly title: string;
  readonly auth: { readonly principal: { readonly id: string; readonly role: string } | null };
  readonly csrfToken: string | null;
}

export default function Home() {
  const current = usePage() as BunwirePage<HomeProps>;
  return createElement("main", null,
    createElement("h1", null, current.props.title),
    createElement("p", null, current.props.auth.principal
      ? `Signed in as ${current.props.auth.principal.id}`
      : "Guest"),
    createElement(Link, { href: "/api/page/dashboard" }, "Dashboard"),
  );
}

import { createElement } from "react";
import { Link, usePage, type BunwirePage } from "@bunwire/bun/react";

interface DashboardProps { readonly title: string; readonly visits: number }

export default function Dashboard() {
  const current = usePage() as BunwirePage<DashboardProps>;
  return createElement("main", null,
    createElement("h1", null, current.props.title),
    createElement("p", null, `Visits: ${current.props.visits}`),
    createElement(Link, { href: "/api/page" }, "Home"),
  );
}

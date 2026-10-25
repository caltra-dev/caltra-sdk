import { createContext } from "react";
/** Keeps native portals inside their owning chat theme and CSS scope. */
export const ThreadPortalContainer = createContext<HTMLElement | null>(null);

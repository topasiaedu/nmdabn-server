import type { Metadata } from "next";
import { NavTabs } from "@/components/NavTabs";
import { ProjectProvider } from "@/lib/project-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "NMDABN dashboards",
  description: "Sales tracking dashboards",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ProjectProvider>
          <NavTabs />
          <main>{children}</main>
        </ProjectProvider>
      </body>
    </html>
  );
}

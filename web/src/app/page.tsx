import type { Metadata } from "next";
import { LocaleProvider } from "@/lib/i18n";
import Landing from "@/components/landing";
import { SITE_COPY, LOCALE_PATHS, LANGUAGE_ALTERNATES } from "@/lib/site";

export const metadata: Metadata = {
  // absolute: the root layout's title template appends " — claudenews",
  // and these titles already start with the name.
  title: { absolute: SITE_COPY.en.title },
  description: SITE_COPY.en.description,
  alternates: { canonical: LOCALE_PATHS.en, languages: LANGUAGE_ALTERNATES },
  openGraph: {
    title: SITE_COPY.en.title,
    description: SITE_COPY.en.description,
    url: LOCALE_PATHS.en,
    locale: "en_US",
  },
};

export default function Page() {
  return (
    <LocaleProvider locale="en">
      <Landing />
    </LocaleProvider>
  );
}

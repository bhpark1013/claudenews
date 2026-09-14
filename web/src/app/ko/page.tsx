import type { Metadata } from "next";
import { LocaleProvider } from "@/lib/i18n";
import Landing from "@/components/landing";
import { SITE_COPY, LOCALE_PATHS, LANGUAGE_ALTERNATES } from "@/lib/site";

export const metadata: Metadata = {
  // absolute: the root layout's title template appends " — claudenews",
  // and these titles already start with the name.
  title: { absolute: SITE_COPY.ko.title },
  description: SITE_COPY.ko.description,
  alternates: { canonical: LOCALE_PATHS.ko, languages: LANGUAGE_ALTERNATES },
  openGraph: {
    title: SITE_COPY.ko.title,
    description: SITE_COPY.ko.description,
    url: LOCALE_PATHS.ko,
    locale: "ko_KR",
  },
};

export default function Page() {
  // The root layout's <html lang> is "en" and Next allows only one root
  // layout, so the Korean subtree declares its own language here. Google
  // reads hreflang and the content itself; this is for screen readers and
  // for engines that do use the attribute.
  return (
    <div lang="ko">
      <LocaleProvider locale="ko">
        <Landing />
      </LocaleProvider>
    </div>
  );
}

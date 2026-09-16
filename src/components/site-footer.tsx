import { ProductFeedback } from "@/components/product-feedback";
import { SiteSignature } from "@/components/site-signature";

export function SiteFooter({ showFeedback }: { showFeedback: boolean }) {
  return (
    <footer className="mx-auto mt-8 w-full max-w-5xl px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12">
      <div className="relative flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border/70 pt-5">
        <SiteSignature />
        {showFeedback ? <ProductFeedback /> : null}
      </div>
    </footer>
  );
}
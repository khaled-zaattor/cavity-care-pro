import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2, Phone, Search, User } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { patientsApi } from "@/api/clinic";

const OPEN_EVENT = "global-patient-search:open";

/** Opens the global patient search dialog from anywhere. */
const openGlobalPatientSearch = () => window.dispatchEvent(new Event(OPEN_EVENT));

const isTypingTarget = (el: EventTarget | null) => {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
};

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Ctrl+K / Cmd+K (or "/" outside inputs) opens a patient search; picking a
 * result opens the patient's profile. Mounted once in Layout.
 */
export function GlobalPatientSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query.trim(), 250);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  // close whenever the route changes
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["global-patient-search", debounced],
    queryFn: () => patientsApi.search(debounced),
    enabled: open && debounced.length > 0,
    staleTime: 30_000,
  });

  const go = (id: string) => {
    setOpen(false);
    navigate(`/patient-profile/${id}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 shadow-lg" dir="rtl">
        <DialogTitle className="sr-only">بحث عن مريض</DialogTitle>
        {/* results come filtered from the server, so cmdk's own filter is off */}
        <Command
          shouldFilter={false}
          dir="rtl"
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3"
        >
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="اكتب اسم المريض أو رقم الهاتف…"
            className="text-right"
          />
          <CommandList>
            {debounced.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">ابدأ الكتابة للبحث عن مريض</div>
            ) : isFetching && results.length === 0 ? (
              <div className="py-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> جارٍ البحث…
              </div>
            ) : (
              <>
                <CommandEmpty>لا يوجد مرضى مطابقون</CommandEmpty>
                {results.length > 0 && (
                  <CommandGroup heading="المرضى">
                    {results.map((p) => (
                      <CommandItem key={p.id} value={p.id} onSelect={() => go(p.id)} className="flex items-center gap-3 cursor-pointer">
                        <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="font-medium truncate">{p.full_name}</span>
                        {p.phone_number && (
                          <span className="ms-auto flex items-center gap-1 text-xs text-muted-foreground" dir="ltr">
                            <Phone className="h-3 w-3" />
                            {p.phone_number}
                          </span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

/** Header trigger for the global search. */
export function GlobalPatientSearchButton() {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={openGlobalPatientSearch}
      className="h-8 sm:h-9 gap-2 text-muted-foreground px-2 sm:px-3"
      aria-label="بحث عن مريض"
    >
      <Search className="h-4 w-4" />
      <span className="hidden md:inline text-sm">بحث عن مريض…</span>
      <kbd className="hidden md:inline-flex pointer-events-none h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium" dir="ltr">
        Ctrl K
      </kbd>
    </Button>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listModerationEvidences,
  decideModerationEvidence,
  fetchModerationMedia,
  ModerationEvidenceItem,
  ModerationReviewStatus,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { SealMark } from "@/components/illustrations";

const PAGE_SIZE = 50;

const TABS = [
  { key: "pending", label: "Bekleyen" },
  { key: "approved", label: "Onaylanan" },
  { key: "rejected", label: "Reddedilen" },
  { key: "all", label: "Tümü" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

type TabCounts = Record<TabKey, number | null>;

const EMPTY_COUNTS: TabCounts = { pending: null, approved: null, rejected: null, all: null };

const AI_STATUS_STYLES: Record<string, string> = {
  VERIFIED: "bg-ok/10 text-ok border-ok/30",
  "INSUFFICIENT EVIDENCE": "bg-warn/10 text-warn border-warn/30",
  CONTRADICTION: "bg-err/10 text-err border-err/30",
};

const AI_STATUS_LABELS: Record<string, string> = {
  VERIFIED: "Doğrulandı",
  "INSUFFICIENT EVIDENCE": "Yetersiz Kanıt",
  CONTRADICTION: "Çelişki",
};

const REVIEW_STATUS_BADGES: Record<string, { label: string; className: string }> = {
  pending: { label: "İnceleme Bekliyor", className: "bg-warn/10 text-warn border-warn/30" },
  approved: { label: "Onaylandı", className: "bg-ok/10 text-ok border-ok/30" },
  rejected: { label: "Reddedildi", className: "bg-err/10 text-err border-err/30" },
};

const statusParam = (tab: TabKey): ModerationReviewStatus | undefined =>
  tab === "all" ? undefined : tab;

const EMPTY_STATES: Record<TabKey, string> = {
  pending: "Bekleyen kanıt yok 🎉",
  approved: "Henüz onaylanmış kanıt bulunmuyor.",
  rejected: "Henüz reddedilmiş kanıt bulunmuyor.",
  all: "Moderasyon kuyruğunda henüz kanıt bulunmuyor.",
};

function formatConfidence(score?: number | null): string | null {
  if (typeof score !== "number" || Number.isNaN(score)) return null;
  // The engine's confidence_score is an int 0-100; a value of 1 means 1%,
  // not a 0-1 float to be scaled up.
  return `%${Math.round(score)}`;
}

function formatDateTime(value?: string | null): string | null {
  if (!value) return null;
  // The engine stores reviewed_at as naive UTC and serializes it without an
  // offset suffix; new Date() would parse that as *local* time and show the
  // review 3 hours early to a UTC+3 admin. Pin offset-less values to UTC.
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const date = new Date(hasOffset || !value.includes("T") ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Media needs the Authorization header, so it cannot be loaded through a
 * plain <img src>. Images are fetched as blobs and shown via an object URL
 * (revoked on cleanup); PDFs are fetched on demand and opened in a new tab.
 */
function MediaPreview({ item }: { item: ModerationEvidenceItem }) {
  const isImage = Boolean(item.media_mime?.startsWith("image/"));
  const isPdf = item.media_mime === "application/pdf";
  // Any other mime with has_media (e.g. a plain-text upload, an accepted
  // /extract/file type per 06_API_CONTRACTS.md §4.7) still needs a way to
  // open/download the original — falls back to the same download-on-demand
  // button used for PDFs instead of silently rendering nothing.
  const isOtherDownloadable = item.has_media && !isImage && !isPdf;

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const pdfUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!item.has_media || !isImage) return;
    let cancelled = false;
    let url: string | null = null;

    fetchModerationMedia(item.id)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setImageUrl(url);
      })
      .catch(() => {
        if (!cancelled) setImageError(true);
      });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [item.id, item.has_media, isImage]);

  // The PDF object URL lives until the card unmounts, so the newly opened
  // tab has time to load it.
  useEffect(
    () => () => {
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    },
    []
  );

  // Used for both PDFs and the generic "other" fallback — either way the
  // file is fetched as an authenticated blob and opened in a new tab.
  const openFile = async () => {
    setPdfError(null);
    if (pdfUrlRef.current) {
      window.open(pdfUrlRef.current, "_blank", "noopener");
      return;
    }
    try {
      setPdfLoading(true);
      const blob = await fetchModerationMedia(item.id);
      const url = URL.createObjectURL(blob);
      pdfUrlRef.current = url;
      window.open(url, "_blank", "noopener");
    } catch (err: unknown) {
      setPdfError(err instanceof Error ? err.message : "Belge görüntülenemedi.");
    } finally {
      setPdfLoading(false);
    }
  };

  if (!item.has_media) return null;

  if (isImage) {
    if (imageError) {
      return (
        <p className="text-[11px] text-err bg-err/10 border border-err/30 rounded-md px-3 py-2">
          Görsel yüklenemedi. Sayfayı yenileyip tekrar deneyebilirsiniz.
        </p>
      );
    }
    if (!imageUrl) {
      return <div className="h-40 bg-raised rounded-md animate-pulse" aria-hidden="true" />;
    }
    return (
      <a
        href={imageUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-md overflow-hidden border border-line bg-well"
        title="Görseli yeni sekmede aç"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- the source
            is an authenticated blob object-URL; next/image cannot optimize
            or even load createObjectURL sources. */}
        <img
          src={imageUrl}
          alt={`Yüklenen kanıt görseli: ${item.media_filename || "adsız dosya"} (${item.candidate_external_id} adayı)`}
          className="max-h-64 w-full object-contain bg-well"
        />
      </a>
    );
  }

  if (isPdf || isOtherDownloadable) {
    const label = isPdf ? "PDF'yi Görüntüle" : "Belgeyi Görüntüle / İndir";
    const loadingLabel = isPdf ? "PDF hazırlanıyor…" : "Belge hazırlanıyor…";
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={openFile}
          disabled={pdfLoading}
          className="btn btn-quiet text-xs px-4 py-2"
        >
          {pdfLoading ? loadingLabel : label}
        </button>
        {pdfError && <p className="text-[11px] text-err">{pdfError}</p>}
      </div>
    );
  }

  return null;
}

function EvidenceCard({
  item,
  deciding,
  initialNote,
  onDecide,
}: {
  item: ModerationEvidenceItem;
  deciding: boolean;
  /** Note recovered from a failed decision; re-seeds the textarea on remount. */
  initialNote?: string;
  onDecide: (item: ModerationEvidenceItem, decision: "approved" | "rejected", note?: string) => void;
}) {
  const [note, setNote] = useState(initialNote ?? "");
  const isPending = item.review_status === "pending";
  const aiLabel = AI_STATUS_LABELS[item.status] ?? item.status;
  const aiStyle = AI_STATUS_STYLES[item.status] ?? "bg-raised text-fg-soft border-line-strong";
  const reviewBadge = REVIEW_STATUS_BADGES[item.review_status];
  const confidence = formatConfidence(item.confidence_score);
  const reviewedAt = formatDateTime(item.reviewed_at);

  return (
    <article className="card card-lift p-6 space-y-4">
      {/* Card header: identifiers and badges */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-fg tabular-nums">Kanıt #{item.id}</span>
          <span className="text-xs font-mono text-fg-soft" title="Aday kimliği">
            {item.candidate_external_id}
          </span>
          <span className="text-xs font-mono text-fg-mute" title="Gereksinim kimliği">
            {item.requirement_external_id}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {item.source_type && (
            <span className="badge uppercase tracking-wider bg-raised text-fg-soft border-line-strong">
              {item.source_type}
            </span>
          )}
          <span className={`badge uppercase tracking-wider ${aiStyle}`}>
            {aiLabel}
          </span>
          {reviewBadge && (
            <span className={`badge uppercase tracking-wider ${reviewBadge.className}`}>
              {reviewBadge.label}
            </span>
          )}
        </div>
      </div>

      {/* AI verdict details */}
      <div className="space-y-2 text-xs">
        {confidence && (
          <p className="text-fg-soft">
            Yapay zekâ güven skoru:{" "}
            <span className="font-semibold text-fg tabular-nums">{confidence}</span>
          </p>
        )}
        {item.reasoning && (
          <p className="text-fg-soft leading-relaxed bg-well border border-line rounded-md p-3">
            <span className="block text-[10px] font-semibold text-fg-mute uppercase tracking-wider mb-1">
              Yapay Zekâ Gerekçesi
            </span>
            {item.reasoning}
          </p>
        )}
        {item.media_filename && (
          <p className="text-fg-mute font-mono text-[11px] truncate" title={item.media_filename}>
            {item.media_filename}
          </p>
        )}
      </div>

      <MediaPreview item={item} />

      {/* Existing review info (approved / rejected items) */}
      {!isPending && (item.reviewed_by || item.review_note) && (
        <div className="text-[11px] text-fg-soft bg-well border border-line rounded-md p-3 space-y-1">
          {item.reviewed_by && (
            <p>
              İnceleyen: <span className="text-fg font-medium">{item.reviewed_by}</span>
              {reviewedAt && <span className="text-fg-mute"> · {reviewedAt}</span>}
            </p>
          )}
          {item.review_note && (
            <p>
              Not: <span className="text-fg">{item.review_note}</span>
            </p>
          )}
        </div>
      )}

      {/* Decision controls */}
      {isPending && (
        <div className="space-y-3 pt-3 border-t border-line">
          <div>
            <label
              htmlFor={`moderation-note-${item.id}`}
              className="block text-[10px] font-semibold text-fg-mute uppercase tracking-wider mb-1"
            >
              Karar Notu (isteğe bağlı)
            </label>
            <textarea
              id={`moderation-note-${item.id}`}
              rows={2}
              value={note}
              disabled={deciding}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Örn: Sertifika görseli net ve okunabilir."
              className="field text-xs leading-relaxed"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={deciding}
              onClick={() => onDecide(item, "approved", note)}
              className="flex-1 py-2.5 bg-ok/10 hover:bg-ok/20 border border-ok/30 text-ok rounded-md text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {deciding ? "Kaydediliyor…" : "Onayla"}
            </button>
            <button
              type="button"
              disabled={deciding}
              onClick={() => {
                // Reject is the higher-cost mistake: it can hide legitimate
                // evidence from an employer, and once decided there is no
                // in-app way to flip it back to pending.
                if (
                  window.confirm(
                    "Bu kanıtı reddetmek istediğinize emin misiniz? Reddedilen kanıt, aday yeniden yüklemedikçe raporda görünmez."
                  )
                ) {
                  onDecide(item, "rejected", note);
                }
              }}
              className="flex-1 py-2.5 bg-err/10 hover:bg-err/20 border border-err/30 text-err rounded-md text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {deciding ? "Kaydediliyor…" : "Reddet"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function CardSkeleton() {
  return (
    <div className="card p-6 space-y-4 animate-pulse" aria-hidden="true">
      <div className="flex items-center justify-between">
        <div className="h-4 w-40 bg-raised rounded" />
        <div className="h-4 w-24 bg-raised rounded" />
      </div>
      <div className="h-3 w-full bg-raised/70 rounded" />
      <div className="h-3 w-5/6 bg-raised/70 rounded" />
      <div className="h-24 w-full bg-raised/50 rounded-md" />
    </div>
  );
}

export default function ModerationPanel() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";

  const [activeTab, setActiveTab] = useState<TabKey>("pending");
  const [items, setItems] = useState<ModerationEvidenceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<TabCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decidingIds, setDecidingIds] = useState<Set<number>>(new Set());
  // The tab the viewer is looking at *right now*. In-flight handlers compare
  // against it so a late response cannot write another tab's items into the
  // currently displayed list.
  const activeTabRef = useRef<TabKey>(activeTab);
  // Notes typed into cards whose decision request failed: the optimistic
  // removal unmounts the card (discarding its local textarea state), so the
  // remounted card re-seeds from here instead of silently wiping the text.
  const [failedNotes, setFailedNotes] = useState<Record<number, string>>({});

  const selectTab = (tab: TabKey) => {
    activeTabRef.current = tab;
    setActiveTab(tab);
  };

  // Role guard: this panel is admin-only; everyone else is sent away.
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.replace(user ? "/" : "/login");
    }
  }, [authLoading, isAdmin, user, router]);

  const refreshCounts = useCallback(async () => {
    try {
      const [pending, approved, rejected, all] = await Promise.all([
        listModerationEvidences({ review_status: "pending", limit: 1, offset: 0 }),
        listModerationEvidences({ review_status: "approved", limit: 1, offset: 0 }),
        listModerationEvidences({ review_status: "rejected", limit: 1, offset: 0 }),
        listModerationEvidences({ limit: 1, offset: 0 }),
      ]);
      setCounts({
        pending: pending.total,
        approved: approved.total,
        rejected: rejected.total,
        all: all.total,
      });
    } catch {
      // Counts are decorative; the list itself carries the error state.
    }
  }, []);

  const fetchList = useCallback(
    async (tab: TabKey) => {
      try {
        setLoading(true);
        setError(null);
        const data = await listModerationEvidences({
          review_status: statusParam(tab),
          limit: PAGE_SIZE,
          offset: 0,
        });
        if (activeTabRef.current !== tab) return; // stale: viewer moved on
        setItems(data.items);
        setTotal(data.total);
        setCounts((prev) => ({ ...prev, [tab]: data.total }));
      } catch (err: unknown) {
        if (activeTabRef.current !== tab) return; // stale: viewer moved on
        setItems([]);
        setTotal(0);
        setError(err instanceof Error ? err.message : "Moderasyon listesi yüklenemedi.");
      } finally {
        // A stale response must not clear the spinner the current tab's
        // still-in-flight request owns.
        if (activeTabRef.current === tab) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!isAdmin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/tab-change, the standard data-load pattern used throughout this app
    fetchList(activeTab);
  }, [isAdmin, activeTab, fetchList]);

  useEffect(() => {
    if (!isAdmin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, the standard data-load pattern used throughout this app
    refreshCounts();
  }, [isAdmin, refreshCounts]);

  const handleLoadMore = async () => {
    // The tab this page belongs to; the response must not append onto a
    // different tab's list if the viewer switches while it is in flight.
    const tab = activeTab;
    try {
      setLoadingMore(true);
      const data = await listModerationEvidences({
        review_status: statusParam(tab),
        limit: PAGE_SIZE,
        offset: items.length,
      });
      if (activeTabRef.current !== tab) return; // stale: viewer moved on
      // Guard against duplicates if the queue shifted while paging.
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...data.items.filter((i) => !seen.has(i.id))];
      });
      setTotal(data.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Daha fazla kayıt yüklenemedi.");
    } finally {
      setLoadingMore(false);
    }
  };

  const handleDecide = async (
    item: ModerationEvidenceItem,
    decision: "approved" | "rejected",
    note?: string
  ) => {
    // The tab the decision was made on; a failed request must roll back
    // *that* tab's list, not whichever tab the viewer switched to meanwhile.
    const tab = activeTab;
    // Where the card sits now, so a failed request can put it back in place.
    // (Whole-list snapshots are not safe here: a concurrent decision on
    // another card would be resurrected by restoring a stale snapshot.)
    const itemIndex = items.findIndex((i) => i.id === item.id);

    setDecidingIds((prev) => new Set(prev).add(item.id));
    setError(null);

    // Optimistic update: reflect the decision immediately. On a filtered tab
    // the item leaves the list; on "Tümü" it stays with its new badge.
    const optimistic: ModerationEvidenceItem = {
      ...item,
      review_status: decision,
      reviewed_by: user?.email ?? item.reviewed_by,
      reviewed_at: new Date().toISOString(),
      review_note: note?.trim() || item.review_note,
    };
    if (tab === "all") {
      setItems((cur) => cur.map((i) => (i.id === item.id ? optimistic : i)));
    } else {
      setItems((cur) => cur.filter((i) => i.id !== item.id));
      setTotal((t) => Math.max(0, t - 1));
    }
    setCounts((cur) => {
      const next = { ...cur };
      const from = item.review_status as TabKey;
      if (from in next && typeof next[from] === "number") {
        next[from] = Math.max(0, (next[from] as number) - 1);
      }
      if (typeof next[decision] === "number") {
        next[decision] = (next[decision] as number) + 1;
      }
      return next;
    });

    try {
      const updated = await decideModerationEvidence(item.id, decision, note);
      // Reconcile with the server's authoritative record where still visible.
      setItems((cur) => cur.map((i) => (i.id === updated.id ? { ...i, ...updated } : i)));
      // The note reached the server; no need to keep a recovery copy.
      setFailedNotes((cur) => {
        if (!(item.id in cur)) return cur;
        const next = { ...cur };
        delete next[item.id];
        return next;
      });
    } catch (err: unknown) {
      // The optimistic removal unmounted the card and its typed note with
      // it; keep the note so the restored card can re-seed its textarea.
      if (tab !== "all" && note) {
        setFailedNotes((cur) => ({ ...cur, [item.id]: note }));
      }
      // Roll back only this item's own optimistic change; concurrent
      // decisions on other cards keep their state. If the viewer switched
      // tabs while the request was in flight, the displayed list belongs to
      // another status — leave it alone; returning to the original tab
      // refetches the authoritative list anyway.
      if (activeTabRef.current === tab) {
        if (tab === "all") {
          setItems((cur) => cur.map((i) => (i.id === item.id ? item : i)));
        } else {
          setItems((cur) => {
            if (cur.some((i) => i.id === item.id)) return cur;
            const next = [...cur];
            next.splice(Math.min(Math.max(itemIndex, 0), next.length), 0, item);
            return next;
          });
          setTotal((t) => t + 1);
        }
      }
      setCounts((cur) => {
        const next = { ...cur };
        const from = item.review_status as TabKey;
        if (from in next && typeof next[from] === "number") {
          next[from] = (next[from] as number) + 1;
        }
        if (typeof next[decision] === "number") {
          next[decision] = Math.max(0, (next[decision] as number) - 1);
        }
        return next;
      });
      setError(err instanceof Error ? err.message : "Moderasyon kararı kaydedilemedi.");
    } finally {
      setDecidingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  // While auth resolves (or a non-admin is being redirected), show a quiet
  // holding state instead of flashing admin content.
  if (authLoading || !isAdmin) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center space-y-6">
        <div className="card p-8 space-y-4">
          <SealMark className="w-12 h-12 mx-auto" />
          <h1 className="text-2xl font-semibold text-fg tracking-tight">Moderasyon Paneli</h1>
          <p className="text-sm text-fg-soft leading-relaxed">
            {authLoading
              ? "Hesap bilgileriniz doğrulanıyor…"
              : "Bu alan yalnızca platform yöneticilerine açıktır. Ana sayfaya yönlendiriliyorsunuz."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto py-8 px-2 sm:px-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-line pb-6">
        <div className="space-y-1">
          <p className="eyebrow">Yönetici</p>
          <h1 className="text-title text-fg">Kanıt Moderasyonu</h1>
          <p className="text-fg-soft text-sm">
            Görsel ve taranmış belgelerden üretilen kanıtlar yayınlanmadan önce burada insan onayından geçer.
          </p>
          <p className="text-fg-mute text-xs">
            Yönetici: <span className="font-semibold text-brand">{user?.email}</span>
          </p>
        </div>
        {typeof counts.pending === "number" && counts.pending > 0 && (
          <span className="self-start md:self-center px-4 py-2 bg-warn/10 border border-warn/30 text-warn text-xs font-semibold rounded-md tabular-nums">
            {counts.pending} kanıt incelemenizi bekliyor
          </span>
        )}
      </div>

      {/* Filter buttons with per-filter counts. Not ARIA tabs: these toggle a
          filter, there is no tabpanel or arrow-key behaviour to promise, so
          a labelled group with aria-pressed is the honest semantics — same
          pattern as the account-type toggle on the register page. */}
      <div role="group" aria-label="Moderasyon durumu filtresi" className="flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const count = counts[tab.key];
          return (
            <button
              key={tab.key}
              type="button"
              aria-pressed={isActive}
              onClick={() => selectTab(tab.key)}
              className={`px-4 py-2 rounded-md text-xs font-semibold border transition-colors flex items-center gap-1.5 ${
                isActive
                  ? "bg-brand/10 border-brand/40 text-brand"
                  : "bg-surface border-line text-fg-soft hover:text-fg hover:border-line-strong"
              }`}
            >
              {tab.label}
              {typeof count === "number" && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] tabular-nums ${
                    isActive ? "bg-brand/15 text-brand-strong" : "bg-raised text-fg-mute"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <div role="alert" className="p-4 bg-err/10 border border-err/30 text-err text-sm rounded-md">
          {error}
        </div>
      )}

      {/* Evidence list */}
      {loading ? (
        <div className="space-y-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : items.length === 0 && !error ? (
        <div className="card text-center py-16 space-y-3">
          <SealMark className="w-12 h-12 mx-auto opacity-60" />
          <p className="text-sm text-fg-soft font-medium">{EMPTY_STATES[activeTab]}</p>
          {activeTab === "pending" && (
            <p className="text-xs text-fg-mute">
              Yeni bir görsel veya taranmış belge yüklendiğinde burada listelenecek.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <EvidenceCard
              key={item.id}
              item={item}
              deciding={decidingIds.has(item.id)}
              initialNote={failedNotes[item.id]}
              onDecide={handleDecide}
            />
          ))}

          {items.length < total && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="btn btn-quiet text-xs px-6 py-2.5 tabular-nums"
              >
                {loadingMore
                  ? "Yükleniyor…"
                  : `Daha fazla göster (${items.length} / ${total})`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

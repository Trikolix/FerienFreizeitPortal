import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarDays, ChevronDown, Euro, Filter, List, Map, MapPin, Search, Tag, UsersRound, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import L from 'leaflet';
import { SearchMap } from '../components/SearchMap';
import { ImageGallery } from '../components/ImageGallery';
import { stripHtmlAndTruncate } from '../utils/textUtils';

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface Holiday {
  id: number;
  name: string;
  starts_at: string;
  ends_at: string;
}

export interface Camp {
  id: number;
  title: string;
  club_name: string;
  min_age: number;
  max_age: number;
  description: string;
  type: string;
  categories?: string[];
  location_text?: string;
  location_lat: number;
  location_lng: number;
  starts_at?: string;
  ends_at?: string;
  price_eur?: number | string;
  registration_deadline?: string;
  status: 'draft' | 'published' | 'fully_booked' | 'archived';
  images?: string[];
}

const parseDateTime = (value?: string) => {
  if (!value) return null;
  const date = new Date(value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateRange = (startValue?: string, endValue?: string) => {
  const start = parseDateTime(startValue);
  const end = parseDateTime(endValue);

  if (!start || !end) return null;

  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) {
    const day = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(start);
    const startTime = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(start);
    const endTime = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(end);
    return `${day} ${startTime}-${endTime}`;
  }

  const formatDay = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' });
  return `${formatDay.format(start)} - ${formatDay.format(end)}`;
};

const formatPrice = (value?: number | string) => {
  if (value === undefined || value === null || value === '') return 'Teilnahmebeitrag auf Anfrage';
  const amount = Number(value);
  if (Number.isNaN(amount)) return String(value);

  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
};

const isRegistrationClosed = (value?: string) => {
  const deadline = parseDateTime(value);
  return Boolean(deadline && deadline < new Date());
};

const getHolidayForCamp = (camp: Camp, holidays: Holiday[]) => holidays.find((holiday) => {
  if (!camp.starts_at || !camp.ends_at) return false;
  const campStart = camp.starts_at.split(' ')[0];
  const campEnd = camp.ends_at.split(' ')[0];
  const holidayStart = holiday.starts_at.split(' ')[0];
  const holidayEnd = holiday.ends_at.split(' ')[0];
  return campStart >= holidayStart && campEnd <= holidayEnd;
});

export const SearchPage: React.FC = () => {
  const [camps, setCamps] = useState<Camp[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [ageFilter, setAgeFilter] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [holidayFilter, setHolidayFilter] = useState('');
  const [bounds, setBounds] = useState<{ minLat: number; maxLat: number; minLng: number; maxLng: number } | null>(null);
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [draftSelectedTypes, setDraftSelectedTypes] = useState<string[]>([]);
  const [draftStartDate, setDraftStartDate] = useState('');
  const [draftEndDate, setDraftEndDate] = useState('');
  const [isDraftTypeDropdownOpen, setIsDraftTypeDropdownOpen] = useState(false);
  const typeDropdownRef = useRef<HTMLDivElement>(null);
  const mobileFilterButtonRef = useRef<HTMLButtonElement>(null);
  const mobileFilterSheetRef = useRef<HTMLDivElement>(null);
  const mobileFilterCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target as Node)) {
        setIsTypeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isMobileFiltersOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileFiltersOpen(false);
        requestAnimationFrame(() => mobileFilterButtonRef.current?.focus());
        return;
      }

      if (event.key !== 'Tab' || !mobileFilterSheetRef.current) return;

      const focusableElements = Array.from(mobileFilterSheetRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);

      if (!firstElement || !lastElement) {
        event.preventDefault();
      } else if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    requestAnimationFrame(() => mobileFilterCloseRef.current?.focus());

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileFiltersOpen]);

  useEffect(() => {
    const fetchHolidays = async () => {
      try {
        const response = await fetch('/api/holidays');
        const data = await response.json();
        setHolidays(data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchHolidays();
  }, []);

  useEffect(() => {
    const fetchCamps = async () => {
      const params = new URLSearchParams();
      if (ageFilter) params.set('age', ageFilter);
      if (selectedTypes.length > 0) params.set('types', selectedTypes.join(','));
      if (startDateFilter) params.set('start_date', startDateFilter);
      if (endDateFilter) params.set('end_date', endDateFilter);
      if (viewMode === 'map' && bounds) {
        params.set('minLat', String(bounds.minLat));
        params.set('maxLat', String(bounds.maxLat));
        params.set('minLng', String(bounds.minLng));
        params.set('maxLng', String(bounds.maxLng));
      }

      try {
        const res = await fetch(`/api/camps?${params.toString()}`);
        const data = await res.json();
        setCamps(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Error fetching camps:', error);
        setCamps([]);
      }
    };

    fetchCamps();
  }, [ageFilter, selectedTypes, startDateFilter, endDateFilter, bounds, viewMode]);

  const typeOptions = useMemo(() => {
    const fallback = ['Sport', 'Lager', 'Kreativ', 'Bildung', 'Natur'];
    const fromCamps = Array.from(new Set(camps.flatMap((camp) => camp.categories || [camp.type]).filter(Boolean)));
    return Array.from(new Set([...fallback, ...fromCamps]));
  }, [camps]);

  const hasActiveFilters = ageFilter !== '' || selectedTypes.length > 0 || startDateFilter !== '' || endDateFilter !== '';
  const additionalFilterCount = selectedTypes.length + (startDateFilter || endDateFilter ? (holidayFilter ? 0 : 1) : 0);
  const resultCountLabel = `${camps.length} ${camps.length === 1 ? 'Angebot' : 'Angebote'}`;

  const applyHolidayFilter = (value: string) => {
    setHolidayFilter(value);
    const selected = holidays.find((holiday) => holiday.id.toString() === value);
    setStartDateFilter(selected ? selected.starts_at.split(' ')[0] : '');
    setEndDateFilter(selected ? selected.ends_at.split(' ')[0] : '');
  };

  const updateStartDateFilter = (value: string) => {
    setHolidayFilter('');
    setStartDateFilter(value);
    if (value && endDateFilter && endDateFilter < value) {
      setEndDateFilter(value);
    }
  };

  const updateEndDateFilter = (value: string) => {
    setHolidayFilter('');
    setEndDateFilter(value);
  };

  const resetFilters = () => {
    setAgeFilter('');
    setSelectedTypes([]);
    setStartDateFilter('');
    setEndDateFilter('');
    setHolidayFilter('');
  };

  const toggleType = (type: string) => {
    setSelectedTypes(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const openMobileFilters = () => {
    setDraftSelectedTypes([...selectedTypes]);
    setDraftStartDate(startDateFilter);
    setDraftEndDate(endDateFilter);
    setIsDraftTypeDropdownOpen(false);
    setIsMobileFiltersOpen(true);
  };

  const closeMobileFilters = () => {
    setIsMobileFiltersOpen(false);
    requestAnimationFrame(() => mobileFilterButtonRef.current?.focus());
  };

  const toggleDraftType = (type: string) => {
    setDraftSelectedTypes((current) => current.includes(type)
      ? current.filter((selectedType) => selectedType !== type)
      : [...current, type]);
  };

  const applyMobileFilters = () => {
    const datesChanged = draftStartDate !== startDateFilter || draftEndDate !== endDateFilter;
    setSelectedTypes(draftSelectedTypes);
    setStartDateFilter(draftStartDate);
    setEndDateFilter(draftEndDate);
    setHolidayFilter(datesChanged ? '' : holidayFilter);
    closeMobileFilters();
  };

  const resetMobileDraftFilters = () => {
    setDraftSelectedTypes([]);
    setDraftStartDate('');
    setDraftEndDate('');
    setIsDraftTypeDropdownOpen(false);
  };

  return (
    <div className="search-page">
      <section className="filter-panel" aria-label="Suchfilter">
        <div className="filter-group-main desktop-filter-controls">
          <div className="filter-title">
            <Filter size={20} />
            <span>Filter</span>
          </div>

          <label className="field">
            <span>Alter</span>
            <div className="input-with-icon">
              <UsersRound size={18} />
              <input
                id="age-filter"
                type="number"
                value={ageFilter}
                onChange={(event) => setAgeFilter(event.target.value)}
                placeholder="z.B. 12"
                min="0"
              />
            </div>
          </label>

          <div className="field">
            <span>Kategorie</span>
            <div className="multi-select-container" ref={typeDropdownRef}>
              <div 
                className="multi-select-trigger" 
                onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
                aria-haspopup="listbox"
                aria-expanded={isTypeDropdownOpen}
              >
                <div className="multi-select-value">
                  <Tag size={18} />
                  <span className={selectedTypes.length ? '' : 'is-placeholder'}>
                    {selectedTypes.length === 0 ? 'Alle Kategorien' : selectedTypes.join(', ')}
                  </span>
                </div>
                <ChevronDown size={16} />
              </div>
              
              <AnimatePresence>
                {isTypeDropdownOpen && (
                  <motion.div 
                    className="multi-select-dropdown"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.15 }}
                  >
                    {typeOptions.map(type => (
                      <label key={type} className="multi-select-option">
                        <input 
                          type="checkbox" 
                          checked={selectedTypes.includes(type)} 
                          onChange={() => toggleType(type)}
                        />
                        <span>{type}</span>
                      </label>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <label className="field">
            <span>Ferien</span>
            <div className="input-with-icon">
              <CalendarDays size={18} />
              <select
                id="holiday-filter"
                aria-label="Ferien auswählen"
                value={holidayFilter}
                onChange={(event) => applyHolidayFilter(event.target.value)}
              >
                <option value="">Alle Zeiträume</option>
                {holidays.map((holiday) => (
                  <option key={holiday.id} value={holiday.id}>{holiday.name}</option>
                ))}
              </select>
            </div>
          </label>

          <div className="field-row">
            <label className="field">
              <span>Zeitraum von</span>
              <div className="input-with-icon">
                <CalendarDays size={18} />
                <input
                type="date"
                value={startDateFilter}
                  onChange={(event) => updateStartDateFilter(event.target.value)}
                />
              </div>
            </label>
            <label className="field">
              <span>bis</span>
              <div className="input-with-icon">
                <CalendarDays size={18} />
                <input
                  type="date"
                  value={endDateFilter}
                  min={startDateFilter}
                  onChange={(event) => updateEndDateFilter(event.target.value)}
                />
              </div>
            </label>
          </div>
          {hasActiveFilters && (
            <button 
              className="text-button filter-reset" 
              onClick={resetFilters} 
            >
              <RotateCcw size={16} />
              Filter zurücksetzen
            </button>
          )}
        </div>

        <div className="mobile-filter-quick">
          <label className="field">
            <span>Alter</span>
            <div className="input-with-icon">
              <UsersRound size={18} />
              <input
                id="mobile-age-filter"
                type="number"
                value={ageFilter}
                onChange={(event) => setAgeFilter(event.target.value)}
                placeholder="z.B. 12"
                min="0"
              />
            </div>
          </label>

          <label className="field">
            <span>Zeitraum</span>
            <div className="input-with-icon">
              <CalendarDays size={18} />
              <select value={holidayFilter} onChange={(event) => applyHolidayFilter(event.target.value)}>
                <option value="">Alle Zeiträume</option>
                {holidays.map((holiday) => (
                  <option key={holiday.id} value={holiday.id}>{holiday.name}</option>
                ))}
              </select>
            </div>
          </label>

          <button
            ref={mobileFilterButtonRef}
            className="mobile-filter-button"
            type="button"
            onClick={openMobileFilters}
            aria-haspopup="dialog"
            aria-expanded={isMobileFiltersOpen}
          >
            <SlidersHorizontal size={18} />
            Filter{additionalFilterCount > 0 ? ` (${additionalFilterCount})` : ''}
          </button>
        </div>

        {(selectedTypes.length > 0 || (startDateFilter || endDateFilter) && !holidayFilter) && (
          <div className="mobile-active-filters" aria-label="Aktive Filter">
            {selectedTypes.map((type) => (
              <button key={type} type="button" onClick={() => setSelectedTypes((current) => current.filter((item) => item !== type))}>
                {type}<X size={14} aria-hidden="true" />
              </button>
            ))}
            {(startDateFilter || endDateFilter) && !holidayFilter && (
              <button type="button" onClick={() => { setStartDateFilter(''); setEndDateFilter(''); }}>
                {startDateFilter || '…'} – {endDateFilter || '…'}<X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </section>

      <div className="result-toolbar">
        <span className="result-count" aria-live="polite">{resultCountLabel}</span>
        <div className="segmented-control" role="group" aria-label="Darstellung wählen">
          <button
            type="button"
            className={viewMode === 'list' ? 'is-active' : ''}
            onClick={() => {
              setViewMode('list');
              setBounds(null);
            }}
            aria-pressed={viewMode === 'list'}
          >
            <List size={18} />
            Liste
          </button>
          <button
            type="button"
            className={viewMode === 'map' ? 'is-active' : ''}
            onClick={() => setViewMode('map')}
            aria-pressed={viewMode === 'map'}
          >
            <Map size={18} />
            Karte
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <section aria-label="Ergebnisliste">
          {camps.length === 0 ? (
            <div className="empty-state">
              <Search size={36} />
              <h2>Keine passenden Freizeiten gefunden</h2>
              <p>Ändere Alter oder Kategorie, um mehr Angebote zu sehen.</p>
            </div>
          ) : (
            <motion.ul
              className="camp-grid"
              initial="hidden"
              animate="show"
              variants={{
                hidden: { opacity: 0 },
                show: { opacity: 1, transition: { staggerChildren: 0.07 } },
              }}
            >
              {camps.map((camp) => {
                const holiday = getHolidayForCamp(camp, holidays);
                return (
                  <motion.li
                    variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                    key={camp.id}
                    className="camp-card"
                    whileHover={{ y: -4, transition: { duration: 0.18 } }}
                  >
                    <div className="camp-media">
                      <ImageGallery images={camp.images} title={camp.title} />
                      <div className="camp-badges">
                        {camp.categories?.map(cat => (
                          <span key={cat} className="camp-type">{cat}</span>
                        )) || <span className="camp-type">{camp.type}</span>}
                        {holiday && (
                          <span className="status-pill is-live badge-pill">
                            <CalendarDays size={14} /> {holiday.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <Link className="camp-body" to={`/freizeiten/${camp.id}`}>
                      <div>
                        <h2>{camp.title}</h2>
                        <p className="provider">{camp.club_name}</p>
                      </div>
                      <div className="camp-meta">
                        {camp.status === 'fully_booked' && (
                          <span className="status-pill is-muted badge-pill">Ausgebucht</span>
                        )}
                        <span>
                          <UsersRound size={16} />
                          {camp.min_age}-{camp.max_age} Jahre
                        </span>
                        <span>
                          <MapPin size={16} />
                          {camp.location_text || 'Ort offen'}
                        </span>
                        {formatDateRange(camp.starts_at, camp.ends_at) && (
                          <span>
                            <CalendarDays size={16} />
                            {formatDateRange(camp.starts_at, camp.ends_at)}
                          </span>
                        )}
                      </div>
                      <div className="camp-description-container">
                        <p className="camp-description">
                          {(() => {
                            const { text, truncated } = stripHtmlAndTruncate(camp.description);
                            return (
                              <>
                                {text}{' '}
                                {truncated && <span className="read-more-link">weiterlesen</span>}
                              </>
                            );
                          })()}
                        </p>
                      </div>
                      <div className="camp-footer">
                        <span>
                          <Euro size={16} />
                          {formatPrice(camp.price_eur)}
                        </span>
                        {isRegistrationClosed(camp.registration_deadline) && <span className="is-warning">Anmeldeschluss vorbei</span>}
                      </div>
                    </Link>
                  </motion.li>
                );
              })}
            </motion.ul>
          )}
        </section>
      ) : (
        <SearchMap camps={camps} setBounds={setBounds} />
      )}

      {isMobileFiltersOpen && (
        <div className="mobile-filter-dialog">
          <button className="mobile-filter-backdrop" type="button" aria-label="Filter schließen" onClick={closeMobileFilters} />
          <div
            ref={mobileFilterSheetRef}
            className="mobile-filter-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-filter-title"
          >
            <div className="mobile-filter-sheet-header">
              <div>
                <span className="eyebrow">Suche verfeinern</span>
                <h2 id="mobile-filter-title">Weitere Filter</h2>
              </div>
              <button ref={mobileFilterCloseRef} className="mobile-filter-close" type="button" onClick={closeMobileFilters} aria-label="Filter schließen">
                <X size={22} />
              </button>
            </div>

            <div className="mobile-filter-sheet-content">
              <div className="field">
                <span>Kategorie</span>
                <div className="multi-select-container">
                  <button
                    type="button"
                    className="multi-select-trigger"
                    onClick={() => setIsDraftTypeDropdownOpen((current) => !current)}
                    aria-haspopup="listbox"
                    aria-expanded={isDraftTypeDropdownOpen}
                  >
                    <span className="multi-select-value">
                      <Tag size={18} />
                      <span className={draftSelectedTypes.length ? '' : 'is-placeholder'}>
                        {draftSelectedTypes.length === 0 ? 'Alle Kategorien' : draftSelectedTypes.join(', ')}
                      </span>
                    </span>
                    <ChevronDown size={16} />
                  </button>

                  {isDraftTypeDropdownOpen && (
                    <div className="multi-select-dropdown" role="listbox" aria-label="Kategorien auswählen">
                      {typeOptions.map((type) => (
                        <label key={type} className="multi-select-option">
                          <input
                            type="checkbox"
                            checked={draftSelectedTypes.includes(type)}
                            onChange={() => toggleDraftType(type)}
                          />
                          <span>{type}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mobile-date-fields">
                <label className="field">
                  <span>Zeitraum von</span>
                  <div className="input-with-icon">
                    <CalendarDays size={18} />
                    <input
                      type="date"
                      value={draftStartDate}
                      onChange={(event) => {
                        const nextStartDate = event.target.value;
                        setDraftStartDate(nextStartDate);
                        if (nextStartDate && draftEndDate && draftEndDate < nextStartDate) {
                          setDraftEndDate(nextStartDate);
                        }
                      }}
                    />
                  </div>
                </label>
                <label className="field">
                  <span>Bis</span>
                  <div className="input-with-icon">
                    <CalendarDays size={18} />
                    <input
                      type="date"
                      value={draftEndDate}
                      min={draftStartDate}
                      onChange={(event) => setDraftEndDate(event.target.value)}
                    />
                  </div>
                </label>
              </div>
            </div>

            <div className="mobile-filter-sheet-actions">
              <button type="button" className="mobile-filter-reset" onClick={resetMobileDraftFilters}>Zurücksetzen</button>
              <button type="button" className="primary-action" onClick={applyMobileFilters}>Filter übernehmen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

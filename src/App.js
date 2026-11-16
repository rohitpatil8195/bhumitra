import React, { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';

const API_BASE = '/api/mrsac';
// Drawing every polygon (and a label marker for each one) can overwhelm the
// browser for villages with very large cadastral datasets.
const MAX_MAP_PARCELS = 500;
const MAX_MAP_LABELS = 100;
const districts = [
  'Ahmednagar', 'Akola', 'Amravati', 'Aurangabad', 'Bhandara', 'Bid', 'Buldana',
  'Chandrapur', 'Dhule', 'Gadchiroli', 'Gondiya', 'Hingoli', 'Jalgaon', 'Jalna',
  'Kolhapur', 'Latur', 'Mumbai City', 'Mumbai Suburban', 'Nagpur', 'Nanded',
  'Nandurbar', 'Nashik', 'Osmanabad', 'Palghar', 'Parbhani', 'Pune', 'Raigarh',
  'Ratnagiri', 'Sangli', 'Satara', 'Sindhudurg', 'Solapur', 'Thane', 'Wardha',
  'Washim', 'Yavatmal',
];
const fallbackDistricts = districts.map(name => ({ id: `sample-${name.toLowerCase().replace(/[^a-z]+/g, '-')}`, name }));

async function apiGet(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options);
  if (!response.ok) {
    let message = `API error: ${response.status}`;
    try { message = (await response.json()).error || message; } catch { /* keep HTTP error */ }
    throw new Error(message);
  }
  return response.json();
}

function Icon({ name, size = 18 }) {
  const paths = {
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5"/><path d="M4 17v4h16v-4"/></>,
    compass: <><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15m6-12v15"/></>,
    close: <><path d="m18 6-12 12M6 6l12 12"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function App() {
  const [district, setDistrict] = useState('');
  const [districtsList, setDistrictsList] = useState(fallbackDistricts);
  const [taluka, setTaluka] = useState('');
  const [talukasList, setTalukasList] = useState([]);
  const [talukaError, setTalukaError] = useState('');
  const [talukaRetry, setTalukaRetry] = useState(0);
  const [village, setVillage] = useState('');
  const [villagesList, setVillagesList] = useState([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [basemap, setBasemap] = useState('street');
  const [fill, setFill] = useState(true);
  const [labels, setLabels] = useState(true);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const [payState, setPayState] = useState('');
  const [paid, setPaid] = useState(false);
  const [sampleData, setSampleData] = useState([]);
  const selectedRef = useRef(selected);
  const labelsRef = useRef(labels);
  const basemapRef = useRef(basemap);
  selectedRef.current = selected;
  labelsRef.current = labels;
  basemapRef.current = basemap;
  const mapRef = useRef(null);
  const parcels = useMemo(() => sampleData.filter(p => !query || p.pin.toLowerCase().includes(query.toLowerCase())), [query, sampleData]);
  const mapParcels = useMemo(() => {
    const visible = sampleData.slice(0, MAX_MAP_PARCELS);
    if (selected && !visible.some(parcel => parcel.pin === selected.pin)) visible.push(selected);
    return visible;
  }, [sampleData, selected]);
  const parcelsRef = useRef(mapParcels);
  const fillRef = useRef(fill);
  parcelsRef.current = mapParcels;
  fillRef.current = fill;

  useEffect(() => {
    apiGet('/districts')
      .then(rows => {
        if (!Array.isArray(rows)) throw new Error('District data format is invalid.');
        const returnedNames = new Set(rows.map(row => row.name));
        setDistrictsList([...rows, ...fallbackDistricts.filter(row => !returnedNames.has(row.name))]);
      })
      .catch(() => setNotice('MRSAC API unavailable. The full Maharashtra district list is still available for map preview.'));
  }, []);

  useEffect(() => {
    setTalukasList([]);
    setTalukaError('');
    if (!district) return;
    if (!/^\d{1,15}$/.test(district)) { setTalukaError('This district is a preview entry and has no MRSAC ID.'); setNotice('Taluka data for this district is not available in the MRSAC catalog.'); return; }
    let active = true;
    const controller = new AbortController();
    const loadTalukas = async () => {
      setLoading('talukas'); setNotice('Loading talukas…');
      let lastError;
      for (let attempt = 0; attempt < 3 && active; attempt += 1) {
        try {
          const rows = await apiGet(`/talukas?district=${encodeURIComponent(district)}`, { signal: controller.signal });
          if (!Array.isArray(rows)) throw new Error('Taluka data format is invalid.');
          if (active) { setTalukasList(rows); setNotice(`${rows.length} talukas available.`); }
          return;
        } catch (error) {
          if (!active || controller.signal.aborted) return;
          lastError = error;
          if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
        }
      }
      if (active) {
        const message = lastError?.message || 'Could not load talukas.';
        setTalukaError(message);
        setNotice(`Could not load talukas: ${message}`);
      }
    };
    loadTalukas().finally(() => { if (active) setLoading(current => current === 'talukas' ? '' : current); });
    return () => { active = false; controller.abort(); };
  }, [district, talukaRetry]);

  useEffect(() => {
    if (!district || !taluka) { setVillagesList([]); return; }
    let active = true;
    setLoading('villages'); setNotice('Loading villages…');
    apiGet(`/villages?district=${encodeURIComponent(district)}&taluka=${encodeURIComponent(taluka)}`)
      .then(rows => { if (!Array.isArray(rows)) throw new Error('Village data format is invalid.'); if (active) { setVillagesList(rows); setNotice(`${rows.length} villages available.`); } })
      .catch(error => { if (active) { setVillagesList([]); setNotice(error.message); } })
      .finally(() => { if (active) setLoading(''); });
    return () => { active = false; };
  }, [district, taluka]);

  useEffect(() => {
    let cancelled = false;
    const key = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
    if (!key) {
      const frame = document.createElement('iframe');
      frame.title = 'Google Maps of Maharashtra'; frame.src = 'https://maps.google.com/maps?q=Maharashtra&z=7&output=embed';
      frame.loading = 'lazy'; frame.referrerPolicy = 'no-referrer-when-downgrade'; frame.className = 'google-map-fallback';
      mapRef.current?.appendChild(frame);
      setNotice('Add a Google Maps API key to display parcel boundaries on the map.');
      return () => { cancelled = true; frame.remove(); };
    }
    const loadGoogleMaps = () => {
      if (window.google?.maps) return Promise.resolve();
      if (document.querySelector('#google-maps-script')) return new Promise((resolve, reject) => { const script = document.querySelector('#google-maps-script'); script.addEventListener('load', resolve, { once: true }); script.addEventListener('error', reject, { once: true }); });
      return new Promise((resolve, reject) => { const script = document.createElement('script'); script.id = 'google-maps-script'; script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}`; script.async = true; script.onload = resolve; script.onerror = reject; document.head.appendChild(script); });
    };
    loadGoogleMaps().then(() => {
      if (cancelled || !mapRef.current || mapRef.current._parcelMap) return;
      const google = window.google;
      const map = new google.maps.Map(mapRef.current, { center: { lat: 19.1, lng: 75.5 }, zoom: 7, mapTypeId: 'roadmap', mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: false, zoomControl: true, zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM }, styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }] });
      mapRef.current._parcelMap = map;
      mapRef.current._setBasemap = type => {
        map.setMapTypeId(type === 'satellite' ? 'hybrid' : 'roadmap');
        map.setOptions({ styles: type === 'none' ? [{ featureType: 'all', elementType: 'labels', stylers: [{ visibility: 'off' }] }, { featureType: 'all', elementType: 'geometry', stylers: [{ color: '#edf1ed' }] }] : type === 'satellite' ? [] : [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }] });
      };
      map.data.addListener('click', event => {
        const parcel = mapRef.current._parcelById?.get(String(event.feature.getId()));
        if (parcel) setSelected({ ...parcel, position: event.latLng });
      });
      mapRef.current._drawParcels = (features, showFill) => {
        mapRef.current._parcelFeatures = features;
        (mapRef.current._parcelLabels || []).forEach(item => item.setMap(null));
        map.data.forEach(feature => map.data.remove(feature));
        const labelsForMap = [], bounds = new google.maps.LatLngBounds();
        const byPin = new Map();
        const geojson = { type: 'FeatureCollection', features: features.map((p, i) => {
          const center = map.getCenter(), x = (p.x - 50) / 85000, y = (50 - p.y) / 85000, dx = p.w / 85000, dy = p.h / 85000;
          const geometry = p.geometry || { type: 'Polygon', coordinates: [[[center.lng() + x, center.lat() + y], [center.lng() + x + dx, center.lat() + y + .00004], [center.lng() + x + dx * 1.04, center.lat() + y - dy], [center.lng() + x + dx * .1, center.lat() + y - dy * 1.03], [center.lng() + x, center.lat() + y]]] };
          const pin = String(p.pin || p.properties?.PIN || '');
          byPin.set(String(i), p);
          const collect = points => {
            if (!Array.isArray(points)) return;
            if (points.length >= 2 && typeof points[0] === 'number' && typeof points[1] === 'number') {
              const lng = Number(points[0]), lat = Number(points[1]);
              if (Number.isFinite(lat) && Number.isFinite(lng)) bounds.extend({ lat, lng });
              return;
            }
            points.forEach(collect);
          };
          collect(geometry.coordinates);
          const outerRing = geometry.type === 'Polygon' ? geometry.coordinates?.[0] : geometry.coordinates?.[0]?.[0];
          if (i < MAX_MAP_LABELS && outerRing?.length) labelsForMap.push({ pin, position: { lat: Number(outerRing[0][1]), lng: Number(outerRing[0][0]) } });
          return { type: 'Feature', id: String(i), properties: { PIN: pin }, geometry };
        }) };
        mapRef.current._parcelById = byPin;
        map.data.addGeoJson(geojson);
        map.data.setStyle(feature => {
          const isSelected = String(feature.getProperty('PIN') || '') === selectedRef.current?.pin;
          return { strokeColor: '#39735e', strokeOpacity: .95, strokeWeight: 1.7, fillColor: isSelected ? '#dda54e' : '#a8c992', fillOpacity: isSelected ? .5 : (showFill ? .54 : 0), clickable: true };
        });
        mapRef.current._parcelLabels = labelsRef.current ? labelsForMap.map(item => new google.maps.Marker({ map, position: item.position, label: { text: item.pin, color: '#345843', fontSize: '10px', fontWeight: '600' }, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0, fillOpacity: 0, strokeOpacity: 0 }, clickable: false })) : [];
        if (!bounds.isEmpty()) mapRef.current._parcelBounds = bounds;
      };
      mapRef.current._fitParcels = () => {
        mapRef.current._drawParcels?.(parcelsRef.current, fillRef.current);
        const bounds = mapRef.current._parcelBounds;
        if (bounds && !bounds.isEmpty()) requestAnimationFrame(() => {
          google.maps.event.trigger(map, 'resize');
          map.fitBounds(bounds, 40);
        });
      };
      mapRef.current._focusParcel = parcel => {
        if (!parcel?.geometry) return;
        const geometry = parcel.geometry;
        const rings = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
        const bounds = new google.maps.LatLngBounds();
        rings.forEach(polygonRings => polygonRings.forEach(ring => ring.forEach(([lng, lat]) => bounds.extend({ lat: Number(lat), lng: Number(lng) }))));
        if (!bounds.isEmpty()) {
          // Wait until Google has measured the map container; otherwise fitBounds
          // can be ignored during startup or while the map panel is rendering.
          requestAnimationFrame(() => {
            google.maps.event.trigger(map, 'resize');
            map.fitBounds(bounds, 48);
          });
        }
      };
      mapRef.current._drawParcels(parcelsRef.current, fillRef.current);
      mapRef.current._setBasemap(basemapRef.current);
      if (selectedRef.current) mapRef.current._focusParcel?.(selectedRef.current);
      else mapRef.current._fitParcels?.();
    }).catch(() => setNotice('Google Maps could not load. Check the API key and Maps JavaScript API settings.'));
    return () => { cancelled = true; };
  }, []); // Google map is initialized once.

  useEffect(() => { mapRef.current?._setBasemap?.(basemap); }, [basemap]);
  useEffect(() => { mapRef.current?._drawParcels?.(mapParcels, fill); }, [mapParcels, fill, labels]);
  useEffect(() => { mapRef.current?._focusParcel?.(selected); }, [selected]);

  // Typing a complete PIN/survey number selects its API feature, including its
  // supplied polygon coordinates and area. Partial text remains a filter.
  useEffect(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return;
    const match = sampleData.find(parcel => parcel.pin.trim().toLocaleLowerCase() === term);
    if (match && selected?.pin !== match.pin) setSelected(match);
  }, [query, sampleData, selected]);

  const handleVillage = async value => {
    setVillage(value); setLoaded(false); setSelected(null); setQuery(''); setSampleData([]);
    if (!value) { setNotice('Choose a village to load its cadastral parcels.'); return; }
    setLoading('plots'); setNotice('Loading village boundaries and survey numbers…');
    try {
      const data = await apiGet(`/plots?district=${encodeURIComponent(district)}&taluka=${encodeURIComponent(taluka)}&village=${encodeURIComponent(value)}`);
      if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error('Invalid GeoJSON response');
      const realParcels = data.features
        .filter(feature => ['Polygon', 'MultiPolygon'].includes(feature?.geometry?.type))
        .map((feature, i) => ({ pin: String(feature.properties?.PIN ?? feature.properties?.pin ?? `Parcel ${i + 1}`), area: String(feature.properties?.AREA ?? feature.properties?.area ?? '—'), properties: feature.properties || {}, geometry: feature.geometry }));
      setSampleData(realParcels); setLoaded(true); setNotice(`${realParcels.length.toLocaleString()} cadastral parcels loaded.`); setTimeout(() => mapRef.current?._fitParcels?.(), 100);
    } catch (error) {
      setSampleData([]); setNotice(`Could not load this village: ${error.message}`);
    } finally { setLoading(''); }
  };
  const exportGeoJSON = () => {
    const features = parcels.map((p, i) => p.geometry ? ({ type: 'Feature', properties: p.properties || { PIN: p.pin, AREA: p.area }, geometry: p.geometry }) : ({ type: 'Feature', properties: { PIN: p.pin, AREA: p.area, VIL_NAME: village || 'Sample village', DTENAME: districtsList.find(d => String(d.id) === String(district))?.name || 'Pune', THENAME: talukasList.find(t => String(t.id) === String(taluka))?.name || 'Haveli' }, geometry: { type: 'Polygon', coordinates: [[[73.962 + i * .0001, 18.576], [73.963 + i * .0001, 18.576], [73.963 + i * .0001, 18.577], [73.962 + i * .0001, 18.577], [73.962 + i * .0001, 18.576]]] } }));
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify({ type: 'FeatureCollection', features }, null, 2)], { type: 'application/geo+json' })); link.download = 'bhumitra-visible-parcels.geojson'; link.click(); URL.revokeObjectURL(link.href);
  };
  const startPayment = async () => {
    if (process.env.REACT_APP_PAYMENT_TEST_MODE !== 'false') {
      setPaid(true);
      setPayState('Test payment completed successfully. No charge was made.');
      return;
    }
    setPayState('Preparing secure checkout…');
    try {
      const response = await fetch('/api/payments/create-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 9900, currency: 'INR', receipt: `parcel-${Date.now()}` }) });
      if (!response.ok) throw new Error('Payment service is not configured yet.');
      const order = await response.json();
      if (!window.Razorpay) await new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = resolve; s.onerror = reject; document.body.appendChild(s); });
      const checkout = new window.Razorpay({ key: order.keyId, amount: order.amount, currency: order.currency || 'INR', name: 'BhuMitra', description: 'Parcel explorer access', order_id: order.id, handler: async result => { const verified = await fetch('/api/payments/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) }); setPayState(verified.ok ? 'Payment confirmed. Thank you!' : 'Payment submitted; verification is pending.'); }, modal: { ondismiss: () => setPayState('Checkout closed.') } });
      checkout.open(); setPayState('');
    } catch (error) { setPayState(error.message || 'Unable to open checkout.'); }
  };

  return <div className="app-shell">
    <aside className="sidebar">
      <header className="side-header"><div className="brand-mark">B</div><div><div className="brand-name">BhuMitra <span>EXPLORER</span></div><div className="brand-caption">MAHARASHTRA · CADASTRAL MAPS</div></div></header>
      <div className="side-scroll">
        <section className="section village-section"><div className="eyebrow"><span className="live-dot"/> MRSAC DATA API</div><h1>Find your village</h1><p className="subtext">Explore cadastral boundaries across Maharashtra.</p>
          <label>District</label><select value={district} onChange={e => { setDistrict(e.target.value); setTaluka(''); setVillage(''); setLoaded(false); setSelected(null); setSampleData([]); }}><option value="">Select district</option>{districtsList.map(d => <option key={d.id} value={d.id}>{d.name || d.id}</option>)}</select>
          <label>Taluka</label><select value={taluka} disabled={!district || loading === 'talukas' || Boolean(talukaError)} onChange={e => { setTaluka(e.target.value); setVillage(''); setLoaded(false); setSelected(null); setSampleData([]); }}><option value="">{loading === 'talukas' ? 'Loading talukas…' : talukaError ? 'Taluka list unavailable' : 'Select taluka'}</option>{talukasList.map(t => <option key={t.id} value={t.id}>{t.name || t.id}</option>)}</select>
          {talukaError && /^\d{1,15}$/.test(district) && <button className="text-button" onClick={() => setTalukaRetry(value => value + 1)}>↻ &nbsp; Retry taluka loading</button>}
          <label>Village</label><select value={village} disabled={!taluka || loading === 'villages'} onChange={e => handleVillage(e.target.value)}><option value="">{loading === 'villages' ? 'Loading villages…' : 'Select village'}</option>{villagesList.map(v => <option key={v.id} value={v.id}>{v.name || v.id}</option>)}</select>
          <button className="text-button" onClick={() => { setDistrictsList(fallbackDistricts); setTalukasList([]); setVillagesList([]); setNotice('Catalog cleared. Reload the page to fetch MRSAC metadata again.'); }}>↻ &nbsp; Reset catalog</button>
          <div className="inline-status"><span className="status-check"><Icon name="check" size={13}/></span><span>{notice || 'Choose a village to load its parcel map.'}</span></div>
        </section>
        <section className="loaded-card"><div className="loaded-icon"><Icon name="map"/></div><div><strong>{loaded ? parcels.length : 0}</strong><span>PARCELS LOADED</span></div><span className="mini-tag">{loading === 'plots' ? 'LOADING' : loaded ? 'MRSAC' : 'READY'}</span></section>
        {loaded && <section className="survey-list"><div className="eyebrow">SURVEY NUMBERS / PIN</div><div className="survey-pills">{parcels.slice(0, 100).map(parcel => <button className={selected?.pin === parcel.pin ? 'active' : ''} key={parcel.pin} onClick={() => setSelected(parcel)}>{parcel.pin}</button>)}</div>{parcels.length > 100 && <p>Showing the first 100 matches. Use search to narrow the list.</p>}{sampleData.length > MAX_MAP_PARCELS && <p>For performance, the map draws the first {MAX_MAP_PARCELS} boundaries. Searching for a survey number also draws that boundary.</p>}</section>}
        <section className="section map-settings"><div className="section-heading"><span className="eyebrow">MAP SETTINGS</span><Icon name="layers" size={17}/></div>
          <label>Parcel / survey identifier</label><div className="search-box"><Icon name="search" size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search PIN in loaded parcels…"/></div>
          <div className="result-row"><span>{parcels.length} parcels shown</span><button onClick={() => setQuery('')}>Reset filters</button></div>
          <label>Map background</label><div className="basemap-toggle"><button className={basemap === 'street' ? 'active' : ''} onClick={() => setBasemap('street')}>Street</button><button className={basemap === 'satellite' ? 'active' : ''} onClick={() => setBasemap('satellite')}>Satellite</button><button className={basemap === 'none' ? 'active' : ''} onClick={() => setBasemap('none')}>Plain</button></div>
          <div className="switch-row"><span>Polygon fill</span><button aria-label="Toggle polygon fill" className={`switch ${fill ? 'on' : ''}`} onClick={() => setFill(!fill)}><i/></button></div>
          <div className="switch-row"><span>Gat / Gut labels <small>(source PIN)</small></span><button aria-label="Toggle parcel labels" className={`switch ${labels ? 'on' : ''}`} onClick={() => setLabels(!labels)}><i/></button></div>
          <button className="fit-button" onClick={() => mapRef.current?._fitParcels?.()}><Icon name="compass" size={17}/> Fit visible boundaries</button>
        </section>
        <section className="section details-section"><div className="eyebrow">03 / PARCEL DETAILS</div>{selected ? <><div className="parcel-title">Parcel {selected.pin}</div><p className="place-line">{districtsList.find(d => String(d.id) === String(district))?.name || district || 'Pune'} / {talukasList.find(t => String(t.id) === String(taluka))?.name || taluka || 'Haveli'} / {villagesList.find(v => String(v.id) === String(village))?.name || village || 'Wagholi'}</p><div className="parcel-actions"><a href={`https://www.google.com/maps/search/?api=1&query=${selected.position ? `${selected.position.lat()},${selected.position.lng()}` : '19.1,75.5'}`} target="_blank" rel="noreferrer"><Icon name="pin" size={14}/> Open in Google Maps ↗</a><a href={`https://www.google.com/maps/dir/?api=1&destination=${selected.position ? `${selected.position.lat()},${selected.position.lng()}` : '19.1,75.5'}&travelmode=driving`} target="_blank" rel="noreferrer"><Icon name="arrow" size={14}/> Navigate ↗</a><button onClick={() => navigator.clipboard?.writeText(`https://www.google.com/maps/search/?api=1&query=${selected.position ? `${selected.position.lat()},${selected.position.lng()}` : '19.1,75.5'}`)}>Copy link</button></div><div className="attr-grid"><span>PIN / SURVEY</span><b>{selected.pin}</b><span>AREA</span><b>{selected.area}</b><span>VILLAGE</span><b>{villagesList.find(v => String(v.id) === String(village))?.name || village || 'Wagholi'}</b></div><button className="clear-selection" onClick={() => setSelected(null)}>Clear selection</button></> : <div className="empty-detail"><span className="empty-gem">◇</span><div><strong>Select a boundary</strong><p>Click a polygon on the map to see its source attributes.</p></div></div>}</section>
      <section className="note-card"><strong>A map, with context.</strong><p>Parcel areas and identifiers are shown as supplied. Cadastral geometry is not a certified land record.</p><button onClick={() => { setLoaded(false); setVillage(''); setSelected(null); setSampleData([]); setNotice('Map cleared. Choose a village to begin.'); }}>Clear loaded data</button></section>
      </div>
      <footer className="side-footer"><span className="live-dot"/> MRSAC cadastral explorer <span>WGS 84</span></footer>
    </aside>
    <main className="map-panel">
      <div ref={mapRef} id="map" aria-label="Interactive cadastral map"/>
      <div className="map-topline"><div className="map-crumb"><span className="crumb-icon"><Icon name="map" size={16}/></span><strong>Maharashtra</strong><span className="slash">/</span><span>Parcel explorer</span></div><button className="upgrade-button" onClick={() => { setPayOpen(true); setPayState(''); }}>{paid ? 'Access active' : 'Unlock full access'} {!paid && <><span>₹99</span><Icon name="arrow" size={14}/></>}</button></div>
      <div className="map-actions"><button className="home-button" title="View Maharashtra" onClick={() => { const map = mapRef.current?._parcelMap; if (map) { map.setCenter({ lat: 19.1, lng: 75.5 }); map.setZoom(7); } }}>⌂</button><button className="export-button" onClick={exportGeoJSON}><Icon name="download" size={15}/> Export GeoJSON</button></div>
      {!loaded && <div className="welcome-card"><div className="welcome-icon"><Icon name="pin" size={22}/></div><div className="eyebrow">YOUR LAND DATA, ON THE MAP</div><h2>Start with a village.</h2><p>Choose a district, taluka and village to display its parcels.</p><div className="welcome-points"><span><Icon name="check" size={14}/> Cadastral boundaries</span><span><Icon name="check" size={14}/> Survey identifiers</span><span><Icon name="check" size={14}/> Map export</span></div></div>}
      <div className="map-legend"><span className="legend-swatch"/><span>Cadastral boundary</span><i/><b>ZOOM 14</b></div>
      <div className="map-credit">Google Maps · Cadastral data © MRSAC</div>
    </main>
    {payOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setPayOpen(false); }}><div className="payment-modal"><button className="modal-close" onClick={() => setPayOpen(false)}><Icon name="close"/></button><div className="payment-icon"><span>B</span></div><div className="eyebrow">BHUMITRA EXPLORER</div><h2>{paid ? 'Access is unlocked' : 'Unlock the full map'}</h2><p>Get access to detailed parcel data, village exports and advanced map tools.</p><div className="price-line"><span>Explorer access</span><strong>₹99 <small>/ month</small></strong></div><div className="payment-benefit"><Icon name="check" size={15}/> {process.env.REACT_APP_PAYMENT_TEST_MODE === 'false' ? 'Secure payment powered by Razorpay' : 'Test mode · no payment will be charged'}</div><button className="pay-button" onClick={startPayment} disabled={paid}>{paid ? 'Payment complete ✓' : 'Continue to payment'} {!paid && <Icon name="arrow" size={16}/>}</button>{payState && <div className="payment-message">{payState}</div>}<small className="secure-note">{process.env.REACT_APP_PAYMENT_TEST_MODE === 'false' ? 'Your payment details are encrypted and processed securely.' : 'This test flow unlocks access without processing a payment.'}</small></div></div>}
  </div>;
}
export default App;

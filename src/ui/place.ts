import { PLACES, customPlace, placeById, type NamedPlace } from '../data/places';
import { h, plain, rubyHtml } from './dom';
import { tzLabel } from './text';

// 観察する場所をえらぶ。プリセットのほか、緯度・経度を入れたり、いまいる場所 (位置情報) を使ったりできる

const NOTE_CUSTOM = '緯度(いど)は北(きた)がプラス・南(みなみ)がマイナス、経度(けいど)は東(ひがし)がプラス・西(にし)がマイナスです。';

export function placePicker(current: NamedPlace, onChange: (place: NamedPlace) => void): HTMLElement {
  const select = h(
    'select',
    { class: 'select', id: 'place-select', 'aria-label': '観察する場所' },
    ...PLACES.map((p) => h('option', { value: p.id }, plain(p.name))),
    h('option', { value: 'custom' }, '緯度・経度を入れる'),
  );
  select.value = placeById(current.id) ? current.id : 'custom';

  const lat = h('input', { type: 'number', class: 'input', min: '-90', max: '90', step: '0.1', value: current.lat.toFixed(2), 'aria-label': '緯度' });
  const lon = h('input', { type: 'number', class: 'input', min: '-180', max: '180', step: '0.1', value: current.lon.toFixed(2), 'aria-label': '経度' });
  const status = h('p', { class: 'place-status', role: 'status' });
  const here = h('button', { type: 'button', class: 'btn btn-small' });
  here.innerHTML = rubyHtml('いまいる場所(ばしょ)を使(つか)う');
  const note = h('p', { class: 'place-note' });
  note.innerHTML = rubyHtml(NOTE_CUSTOM);
  const latLabel = h('label', { class: 'field' }, h('span', {}, '緯度'), lat);
  const lonLabel = h('label', { class: 'field' }, h('span', {}, '経度'), lon);
  const custom = h('div', { class: 'place-custom' }, h('div', { class: 'place-fields' }, latLabel, lonLabel), note, here, status);
  const meta = h('p', { class: 'place-meta' });

  const showMeta = (p: NamedPlace) => {
    const ns = p.lat >= 0 ? `北緯${p.lat.toFixed(1)}°` : `南緯${(-p.lat).toFixed(1)}°`;
    const ew = p.lon >= 0 ? `東経${p.lon.toFixed(1)}°` : `西経${(-p.lon).toFixed(1)}°`;
    meta.textContent = `${ns}・${ew}・時刻は ${tzLabel(p.tz)}`;
  };
  const toggle = () => {
    custom.hidden = select.value !== 'custom';
  };
  const applyCustom = (name?: string) => {
    const a = Number(lat.value);
    const b = Number(lon.value);
    if (!Number.isFinite(a) || !Number.isFinite(b) || lat.value === '' || lon.value === '') return;
    const p = customPlace(a, b, name);
    showMeta(p);
    onChange(p);
  };

  select.addEventListener('change', () => {
    toggle();
    if (select.value === 'custom') applyCustom();
    else {
      const p = placeById(select.value)!;
      lat.value = p.lat.toFixed(2);
      lon.value = p.lon.toFixed(2);
      showMeta(p);
      onChange(p);
    }
  });
  lat.addEventListener('change', () => applyCustom());
  lon.addEventListener('change', () => applyCustom());
  here.addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      status.textContent = 'この端末では、いまいる場所を調べられません。';
      return;
    }
    here.disabled = true;
    status.textContent = '調べています…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        here.disabled = false;
        status.textContent = '';
        // 空の見え方には 0.1° (約 10 km) で十分。細かい位置は保存しない
        lat.value = pos.coords.latitude.toFixed(1);
        lon.value = pos.coords.longitude.toFixed(1);
        applyCustom('いまいる場所(ばしょ)');
      },
      () => {
        here.disabled = false;
        status.textContent = '場所を調べられませんでした。緯度・経度を入れてください。';
      },
      { timeout: 10000, maximumAge: 600000 },
    );
  });

  toggle();
  showMeta(current);
  return h('div', { class: 'place-picker' }, select, meta, custom);
}

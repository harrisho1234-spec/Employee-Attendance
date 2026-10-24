(function (root) {
    'use strict';
    const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
    function resolve(key, field, snapshot, legacy, fallback = '') {
        const override = snapshot?.overrides?.[key];
        if (own(override, field)) return override[field]; // An intentionally blank override is still an override.
        if (!override?.[field + 'Reset'] && own(legacy, key)) return legacy[key];
        if (own(snapshot?.records?.[key], field)) return snapshot.records[key][field];
        return fallback;
    }
    function escape(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
    if (typeof module !== 'undefined') module.exports = { resolve, escape };
    if (!root.document) return;
    const config = root.LEAVE_SYNC_CONFIG || {};
    let credential = '', snapshot = null, currentYear = null, generation = 0, pending = false, expiryTimer;
    let lastAttempt = 0, mutation = Promise.resolve();
    const status = text => { document.getElementById('leaveSyncStatus').textContent = text; };
    const redraw = () => {
        // Invalid/empty date filters can make the existing renderer return early.
        // Clear derived private views first, including its company-popup model.
        if (typeof currentDailyGroupedData !== 'undefined') currentDailyGroupedData = {};
        document.getElementById('dailyTableBody').textContent = '';
        document.getElementById('dailyMobileCards').textContent = '';
        if (typeof renderDailyAttendance === 'function') renderDailyAttendance();
        const modal = document.getElementById('dailyCompanyModal');
        if (!modal.classList.contains('hidden') && modal.dataset.company) openDailyCompanyModal(modal.dataset.company);
    };
    const selectedYear = () => Number(document.getElementById('dailyFilterFrom')?.value?.slice(0, 4)) || new Date().getFullYear();
    function clear(message) {
        generation++; credential = ''; snapshot = null; currentYear = null; pending = false;
        clearTimeout(expiryTimer);
        document.getElementById('editNoteText').value = '';
        document.getElementById('editNoteId').value = '';
        if (typeof closeNoteEdit === 'function') closeNoteEdit();
        if (typeof closeDailyCompanyModal === 'function') closeDailyCompanyModal();
        document.getElementById('dailyCompanyModal').classList.add('hidden');
        document.getElementById('dailyCompanyModalBody').textContent = '';
        status(message); redraw();
    }
    async function request(body) {
        if (!credential) throw new Error('Sign in to edit private leave details.');
        const response = await fetch(config.apiUrl, { method: 'POST', cache: 'no-store', credentials: 'omit',
            headers: { 'Authorization': 'Bearer ' + credential, 'Content-Type': 'application/json' },
            body: JSON.stringify(body), signal: AbortSignal.timeout(40000) });
        if (response.status === 401 || response.status === 403) {
            clear('Access expired or denied. Sign in with an authorized account.');
            throw new Error('Access expired or denied.');
        }
        if (!response.ok) throw new Error('Private sync unavailable; changes were not confirmed.');
        const data = await response.json();
        if (!data.ok || !data.records || !data.overrides) throw new Error('Invalid private sync response.');
        return data;
    }
    async function refresh(force = false) {
        const year = selectedYear();
        if (document.activeElement?.matches('[data-leave-reason], #editNoteText') ||
            !document.getElementById('noteEditModal').classList.contains('hidden')) return;
        if (!credential || pending || (!force && currentYear === year && Date.now() - lastAttempt < 60000)) return;
        if (currentYear !== year) { snapshot = null; currentYear = year; }
        pending = true; lastAttempt = Date.now(); const sequence = generation;
        status('Syncing private leave details…');
        try {
            const data = await request({ action: 'read', year });
            if (sequence !== generation || year !== selectedYear()) return;
            snapshot = data;
            status('Sheet sync: ' + new Date(data.syncedAt).toLocaleTimeString() + (data.skipped ? ` · ${data.skipped} invalid/unsynced rows skipped` : ''));
            redraw();
        } catch (error) {
            if (sequence === generation) { snapshot = null; status(error.message); redraw(); }
        } finally {
            if (sequence === generation) {
                pending = false;
                if (credential && selectedYear() !== year) void refresh(true);
            }
        }
    }
    async function change(key, field, value, action) {
        const sequence = ++generation; // Any in-flight refresh must not overwrite this edit.
        pending = true;
        const year = Number(key.split('_').at(-1));
        try {
            const data = await request({ action, year, key, field, value });
            if (sequence !== generation) return false;
            if (year === selectedYear()) { snapshot = data; currentYear = year; }
            lastAttempt = Date.now(); status(action === 'reset' ? 'Reset to Sheet.' : 'Manual override saved privately.');
            redraw(); return true;
        } catch (error) { status(error.message); showAppToast(error.message, 'error'); redraw(); return false; }
        finally { if (sequence === generation) pending = false; }
    }
    root.leaveSync = {
        value: (key, field, legacy, fallback) => resolve(key, field, snapshot, legacy, fallback),
        escape,
        ensure: () => { if (credential && !pending && (currentYear !== selectedYear() || Date.now() - lastAttempt >= 60000)) void refresh(); },
        refresh: () => refresh(true),
        save: (key, field, value) => {
            const session = credential;
            return mutation = mutation.then(() => session === credential ? change(key, field, value, 'override') : false);
        },
        reset: (key, field) => {
            const session = credential;
            return mutation = mutation.then(() => session === credential ? change(key, field, undefined, 'reset') : false);
        },
        signOut: () => { root.google?.accounts.id.disableAutoSelect(); clear('Signed out. Private leave details cleared.'); },
        noteHtml: n => `<div class="flex items-center gap-1 mb-1">${n.prefix || ''}<button type="button" class="bg-slate-50 border rounded px-2 py-1 text-xs" data-leave-note="${escape(n.id)}" data-note-value="${escape(n.text)}">${escape(n.text || 'Add Note')}</button><button type="button" class="text-xs text-blue-600" data-leave-reset="${escape(n.id)}" data-field="note">Reset to Sheet</button></div>`,
        reasonHtml: (key, text, prefix) => `${prefix}<div class="flex items-center gap-1 mb-1"><input aria-label="Leave reason" maxlength="2000" class="w-full bg-slate-50 border rounded p-1.5 text-xs" data-leave-reason="${escape(key)}" data-original="${escape(text)}" value="${escape(text)}" placeholder="Reason…"><button type="button" class="text-xs text-blue-600" data-leave-reset="${escape(key)}" data-field="reason">Reset to Sheet</button></div>`
    };
    document.addEventListener('click', event => {
        const reset = event.target.closest('[data-leave-reset]');
        if (reset) { event.stopPropagation(); void root.leaveSync.reset(reset.dataset.leaveReset, reset.dataset.field); }
        const note = event.target.closest('[data-leave-note]');
        if (note) openNoteEdit(event, note.dataset.leaveNote, note.dataset.noteValue);
    }, true);
    document.addEventListener('focusout', event => {
        const input = event.target.closest('[data-leave-reason]');
        if (input && input.value !== input.dataset.original) void root.leaveSync.save(input.dataset.leaveReason, 'reason', input.value);
    });
    document.addEventListener('DOMContentLoaded', () => {
        if (!config.apiUrl || !config.googleClientId) { status('Private leave sync needs setup. See the repository setup guide.'); return; }
        if (!/^https:\/\//.test(config.apiUrl)) { status('Private bridge must use HTTPS.'); return; }
        const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
        script.onerror = () => status('Google sign-in could not load.');
        script.onload = () => {
            google.accounts.id.initialize({ client_id: config.googleClientId, callback: response => {
                clearTimeout(expiryTimer); generation++; snapshot = null; currentYear = null; pending = false;
                credential = response.credential;
                // Expiry is only used to clear UI memory; authentication is performed by the server.
                const claims = JSON.parse(atob(credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
                expiryTimer = setTimeout(() => clear('Session expired. Sign in again.'), Math.max(0, claims.exp * 1000 - Date.now()));
                void refresh(true);
            }});
            google.accounts.id.renderButton(document.getElementById('leaveGoogleSignIn'), { theme: 'outline', size: 'medium' });
            status('Sign in to connect private leave details.');
        };
        document.head.appendChild(script);
        setInterval(() => { if (!document.hidden) void refresh(); }, 60000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
    });
})(typeof window === 'undefined' ? globalThis : window);

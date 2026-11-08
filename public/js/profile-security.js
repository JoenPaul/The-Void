let pinSettingsProfile = null, pinSettingsTransition = null, securityBusy = false, resetTarget = null;

function openPinSettings(id, transition = null) {
    pinSettingsProfile = id;
    pinSettingsTransition = transition;
    $('#pin-settings-description').textContent = transition ? 'Your PIN was set to 123. Choose a new PIN with 4–12 digits before continuing.' : 'Choose a new PIN with 4–12 digits.';
    ['#current-pin','#changed-pin','#changed-pin-confirm'].forEach(selector => $(selector).value = '');
    $('#pin-settings-error').textContent = '';
    $('#pin-settings').showModal();
}
$('#profile-settings').addEventListener('click', () => {
    closeProfileMenu();
    if (activeProfile) $('#user-settings').showModal();
    else showProfileChooser();
});
$('#entry-pin').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); confirmProfileTransition(); }
});
async function cancelPinSettings() {
    if (securityBusy) return;
    if (pinSettingsTransition) {
        try { await profileRequest('/profile-logout', 'POST'); }
        catch (error) { $('#pin-settings-error').textContent = error.message; return; }
    }
    pinSettingsTransition = null;
    profileTransition = null;
    $('#pin-settings').close();
}
$('#cancel-pin-settings').addEventListener('click', cancelPinSettings);
$('#pin-settings').addEventListener('cancel', event => { event.preventDefault(); cancelPinSettings(); });
$('#change-pin-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (securityBusy) return;
    securityBusy = true;
    $('#save-pin').disabled = true;
    $('#pin-settings-error').textContent = '';
    try {
        await profileRequest('/profiles/' + encodeURIComponent(pinSettingsProfile) + '/pin', 'PUT', {
            current_pin:$('#current-pin').value,pin:$('#changed-pin').value,pin_confirmation:$('#changed-pin-confirm').value,
        });
        ['#current-pin','#changed-pin','#changed-pin-confirm'].forEach(selector => $(selector).value = '');
        $('#pin-settings').close();
        if (pinSettingsTransition?.action === 'edit') editProfile(profiles.find(profile => profile.id === pinSettingsProfile));
        else if (pinSettingsTransition) await enterProfile(pinSettingsProfile);
        pinSettingsTransition = null;
        profileTransition = null;
        notify('Your PIN has been changed.');
    } catch (error) { $('#pin-settings-error').textContent = error.message; }
    finally { securityBusy = false; $('#save-pin').disabled = false; }
});

let adminMenuOpen = false;
function setAdminMenu(open) {
    adminMenuOpen = open;
    $('#admin-workspace').setAttribute('data-menu-open', String(open));
    $('#admin-menu-toggle').setAttribute('aria-expanded', String(open));
}
$('#admin-menu-toggle').addEventListener('click', () => setAdminMenu(!adminMenuOpen));

function showAdminLogin() {
    setAdminMenu(false);
    $('#admin-menu-toggle').hidden = true;
    $('#superadmin-login').hidden = false;
    $('#admin-workspace').hidden = true;
    $('#admin-profile-rows').innerHTML = '';
    $('#admin-pin').value = '';
}
$('#superadmin-open').addEventListener('click', () => {
    showAdminLogin();
    $('#admin-message').textContent = '';
    $('#superadmin').showModal();
});
async function closeAdmin() {
    if (securityBusy) return;
    try {
        await profileRequest('/superadmin/logout', 'POST');
        showAdminLogin();
        $('#superadmin').close();
    } catch (error) { $('#admin-message').textContent = error.message; }
}
$('#superadmin').addEventListener('cancel', event => { event.preventDefault(); closeAdmin(); });
$('#admin-logout').addEventListener('click', closeAdmin);
$('#superadmin-close').addEventListener('click', closeAdmin);
$('#superadmin-login').addEventListener('submit', async event => {
    event.preventDefault();
    if (securityBusy) return;
    securityBusy = true;
    $('#admin-signin').disabled = true;
    $('#admin-message').textContent = '';
    try {
        await profileRequest('/superadmin/login', 'POST', {pin:$('#admin-pin').value});
        $('#admin-pin').value = '';
        const result = await profileRequest('/superadmin/profiles');
        $('#superadmin-login').hidden = true;
        $('#admin-workspace').hidden = false;
        $('#admin-menu-toggle').hidden = false;
        showAdminSection('profiles');
        renderAdminProfiles(result.profiles);
    } catch (error) { $('#admin-message').textContent = error.message; }
    finally { securityBusy = false; $('#admin-signin').disabled = false; }
});
$('#admin-reset-cancel').addEventListener('click', () => { if (!securityBusy) $('#admin-reset').close(); });
$('#admin-reset').addEventListener('cancel', event => { if (securityBusy) event.preventDefault(); });
$('#admin-reset-confirm').addEventListener('click', async () => {
    if (securityBusy || !resetTarget) return;
    securityBusy = true;
    $('#admin-reset-confirm').disabled = true;
    try {
        const action = resetTarget.action;
        const archived = action === 'archive';
        await profileRequest('/superadmin/profiles/' + encodeURIComponent(resetTarget.id) + (action === 'reset' ? '/pin' : '/archive'), 'PUT', action === 'reset' ? undefined : {archived});
        if (action !== 'reset') {
            resetTarget.accounts.find(profile => profile.id === resetTarget.id).deleted_at = archived ? new Date().toISOString() : null;
            renderAdminProfiles(resetTarget.accounts);
            await loadProfiles();
        }
        $('#admin-message').textContent = resetTarget.name + (action === 'reset' ? '’s PIN was reset to 123. A new PIN is required at next login.' : archived ? ' archived. Saved data kept.' : ' unarchived. Profile is available again.');
        $('#admin-reset').close();
    } catch (error) { $('#admin-reset-error').textContent = error.message; }
    finally { securityBusy = false; $('#admin-reset-confirm').disabled = false; }
});

$('#superadmin-login').querySelectorAll('[data-admin-digit]').forEach(button => button.addEventListener('click', () => { if (!securityBusy && $('#admin-pin').value.length < 12) $('#admin-pin').value += button.dataset.adminDigit; }));
$('#admin-pin-clear').addEventListener('click', () => { if (!securityBusy) $('#admin-pin').value = ''; });
$('#admin-pin-backspace').addEventListener('click', () => { if (!securityBusy) $('#admin-pin').value = $('#admin-pin').value.slice(0,-1); });
$('#admin-change-pin').addEventListener('click', () => {
    ['#admin-current-pin','#admin-new-pin','#admin-confirm-pin'].forEach(id => $(id).value = '');
    $('#admin-pin-error').textContent = '';
    $('#admin-pin-settings').showModal();
});
$('#admin-pin-cancel').addEventListener('click', () => { if (!securityBusy) $('#admin-pin-settings').close(); });
$('#admin-pin-settings').addEventListener('cancel', event => { if (securityBusy) event.preventDefault(); });
$('#admin-pin-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (securityBusy) return;
    securityBusy = true; $('#admin-pin-save').disabled = true;
    try {
        await profileRequest('/superadmin/pin','PUT',{current_pin:$('#admin-current-pin').value,pin:$('#admin-new-pin').value,pin_confirmation:$('#admin-confirm-pin').value});
        ['#admin-current-pin','#admin-new-pin','#admin-confirm-pin'].forEach(id => $(id).value = '');
        $('#admin-pin-settings').close(); $('#admin-message').textContent = 'Superadmin PIN changed. Other admin sessions have been signed out.';
    } catch (error) { $('#admin-pin-error').textContent = error.message; }
    finally { securityBusy = false; $('#admin-pin-save').disabled = false; }
});

function showAdminSection(section) {
    if (adminMenuOpen) $('#admin-menu-toggle').focus();
    setAdminMenu(false);
    $('.admin-main').scrollTop = 0;
    $('#admin-accounts').hidden = section !== 'profiles';
    $('#admin-settings-panel').hidden = section !== 'settings';
    $('#admin-nav-profiles').setAttribute('aria-current',section === 'profiles' ? 'page' : 'false');
    $('#admin-nav-settings').setAttribute('aria-current',section === 'settings' ? 'page' : 'false');
    $('#admin-message').textContent = '';
}
$('#admin-nav-profiles').addEventListener('click', () => showAdminSection('profiles'));
$('#admin-nav-settings').addEventListener('click', () => showAdminSection('settings'));

function renderAdminProfiles(accounts) {
        $('#admin-empty').hidden = accounts.length !== 0;
        $('#admin-profile-rows').innerHTML = accounts.map(profile => `<tr><td><span class="admin-avatar avatar-${avatarClass(profile)}">${escapeHtml(avatarFor(profile))}</span>${escapeHtml(profile.name)}</td><td>${escapeHtml(profile.created_at ? new Date(profile.created_at.replace(' ','T') + (profile.created_at.includes('Z') ? '' : 'Z')).toLocaleString() : 'Unknown')}</td><td>${profile.deleted_at ? 'Archived' : 'Active'}</td><td><div class="admin-row-actions"><span class="admin-action-tooltip" data-tooltip="Reset PIN" title="Reset PIN"><button class="secondary admin-icon-action" aria-label="Reset PIN" data-reset-profile="${escapeHtml(profile.id)}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="9" r="4"/><path d="m11 12 8 8m-3-3 3-3m-6 0 3-3"/></svg></button></span><span class="admin-action-tooltip" data-tooltip="Archive" title="Archive"><button class="secondary admin-icon-action" aria-label="Archive" data-archive-profile="${escapeHtml(profile.id)}" ${profile.deleted_at ? 'disabled' : ''}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h16v12H4zM3 4h18v4H3zM9 12h6"/></svg></button></span><span class="admin-action-tooltip" data-tooltip="Unarchive" title="Unarchive"><button class="secondary admin-icon-action" aria-label="Unarchive" data-unarchive-profile="${escapeHtml(profile.id)}" ${profile.deleted_at ? '' : 'disabled'}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v8h16v-8M3 8h4m10 0h4M12 15V3m-4 4 4-4 4 4"/></svg></button></span></div></td></tr>`).join('');
    $('#admin-profile-rows').querySelectorAll('[data-reset-profile], [data-archive-profile], [data-unarchive-profile]').forEach(button => button.addEventListener('click', () => {
        if (securityBusy) return;
        const action = button.dataset.resetProfile ? 'reset' : button.dataset.archiveProfile ? 'archive' : 'unarchive';
        const id = button.dataset.resetProfile || button.dataset.archiveProfile || button.dataset.unarchiveProfile;
        const profile = accounts.find(item => item.id === id);
        resetTarget = {...profile, action, accounts};
        $('#admin-reset-title').textContent = action === 'reset' ? 'Reset PIN?' : action === 'archive' ? 'Archive profile?' : 'Unarchive profile?';
        $('#admin-reset-description').textContent = action === 'reset'
            ? 'Reset ' + profile.name + '’s PIN to 123? They will be signed out and must choose a new PIN when they next sign in.'
            : action === 'archive' ? 'Archive ' + profile.name + '? This hides their profile and blocks access. Their saved data will be kept.'
            : 'Unarchive ' + profile.name + '? Their profile will be available again with its existing PIN and saved data.';
        $('#admin-reset-confirm').textContent = action === 'reset' ? 'Reset to 123' : action === 'archive' ? 'Archive profile' : 'Unarchive profile';
        $('#admin-reset-error').textContent = '';
        $('#admin-reset').showModal();
    }));
}

function closeProfileMenu() {
    $('#profile-menu').hidden = true;
    $('#switch-profile').setAttribute('aria-expanded','false');
}
$('#switch-profile').addEventListener('click', () => {
    if (!activeProfile) { showProfileChooser(); return; }
    const opening = $('#profile-menu').hidden;
    $('#profile-menu').hidden = !opening;
    $('#switch-profile').setAttribute('aria-expanded',String(opening));
});
$('#profile-signout').addEventListener('click', () => { closeProfileMenu(); requestProfileLeave(); });
$('#user-edit-profile').addEventListener('click', () => { $('#user-settings').close(); if (activeProfile) editProfile(activeProfile); });
$('#user-change-pin').addEventListener('click', () => { $('#user-settings').close(); if (activeProfile) openPinSettings(activeProfile.id); });
$('#user-settings-close').addEventListener('click', () => $('#user-settings').close());
document.addEventListener('click', event => { if (!$('#switch-profile').contains(event.target) && !$('#profile-menu').contains(event.target)) closeProfileMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('#profile-menu').hidden) { closeProfileMenu(); $('#switch-profile').focus(); } });

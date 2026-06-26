// Global State
let leads = [];
let stats = {
    totalLeads: 0,
    emailsSent: 0,
    emailsOpened: 0,
    openRate: 0,
    linksClicked: 0,
    clickRate: 0
};
let activeTab = 'form-tab';
let selectedEmailLeadId = null;
let toastTimeout = null;

// DOM Elements
const navButtons = document.querySelectorAll('.nav-btn');
const tabPanes = document.querySelectorAll('.tab-pane');
const pageTitle = document.getElementById('page-title');
const pageSubtitle = document.getElementById('page-subtitle');
const leadForm = document.getElementById('lead-form');
const refreshBtn = document.getElementById('refresh-btn');
const leadsTableBody = document.getElementById('leads-table-body');
const emailListBody = document.getElementById('email-list-body');
const emailViewer = document.getElementById('email-viewer');
const emptyViewerState = document.getElementById('empty-viewer-state');
const emailDetailsContainer = document.getElementById('email-details-container');
const emailToField = document.getElementById('email-to-field');
const emailSubjectField = document.getElementById('email-subject-field');
const emailDateField = document.getElementById('email-date-field');
const emailBodyIframe = document.getElementById('email-body-iframe');
const inboxBadge = document.getElementById('inbox-badge');

// Stats Counters Elements
const statTotalLeads = document.getElementById('stat-total-leads');
const statEmailsSent = document.getElementById('stat-emails-sent');
const statEmailsOpened = document.getElementById('stat-emails-opened');
const statOpenRate = document.getElementById('stat-open-rate');
const statLinksClicked = document.getElementById('stat-links-clicked');
const statClickRate = document.getElementById('stat-click-rate');

// Toast Notification Elements
const toast = document.getElementById('notification-toast');

// API Base URL
const API_URL = ''; // Relative path because backend hosts front-end

// Page Load Initializations
document.addEventListener('DOMContentLoaded', () => {
    // Tab switching routing
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            const hash = tabId === 'form-tab' ? 'form' : tabId === 'dashboard-tab' ? 'dashboard' : 'inbox';
            window.location.hash = hash;
        });
    });

    // Form Submission
    leadForm.addEventListener('submit', handleFormSubmit);

    // Refresh Dashboard button
    refreshBtn.addEventListener('click', () => {
        fetchLeadsAndStats();
        showToast('System Refreshed', 'Successfully fetched latest analytics data.', 'success');
    });

    // Check url for success query parameters
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('clicked')) {
        showToast('Link Click Tracked!', 'The lead clicked the email trackable link. Real-time metric updated.', 'click');
        // Clean URL to avoid infinite toasts on reload
        window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    }

    // Initial Fetch & Start Polling
    fetchLeadsAndStats();
    setInterval(fetchLeadsAndStats, 1500); // 1.5 seconds polling for real-time response

    // Handle initial hash routing
    handleHashRouting();
});

// Handle hash routing
window.addEventListener('hashchange', handleHashRouting);

function handleHashRouting() {
    const hash = window.location.hash.substring(1);
    if (hash === 'dashboard') {
        switchTab('dashboard-tab');
    } else if (hash === 'inbox') {
        switchTab('inbox-tab');
    } else {
        switchTab('form-tab');
    }
}

// Switch view tabs
function switchTab(tabId) {
    activeTab = tabId;

    // Update nav menu active states
    navButtons.forEach(btn => {
        if (btn.getAttribute('data-tab') === tabId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Update tab visibility
    tabPanes.forEach(pane => {
        if (pane.id === tabId) {
            pane.classList.add('active');
        } else {
            pane.classList.remove('active');
        }
    });

    // Update headers text dynamically
    if (tabId === 'form-tab') {
        pageTitle.innerText = 'Lead Capture Form';
        pageSubtitle.innerText = 'Submit details to trigger automated tracking email';
    } else if (tabId === 'dashboard-tab') {
        pageTitle.innerText = 'Analytics Dashboard';
        pageSubtitle.innerText = 'Real-time stats, conversion rates, and AI classification';
        fetchLeadsAndStats(); // Immediate fetch on view
    } else if (tabId === 'inbox-tab') {
        pageTitle.innerText = 'Simulator Inbox';
        pageSubtitle.innerText = 'Interact with sent emails to test the tracking system';
        fetchLeadsAndStats();
    }
}

// Fetch Stats and Leads from backend API
async function fetchLeadsAndStats() {
    try {
        const [statsRes, leadsRes] = await Promise.all([
            fetch(`${API_URL}/api/stats`),
            fetch(`${API_URL}/api/leads`)
        ]);

        if (statsRes.ok && leadsRes.ok) {
            const newStats = await statsRes.json();
            const newLeads = await leadsRes.json();

            // Detect changes in Open/Click states for live notifications
            detectLiveUpdates(newLeads);

            stats = newStats;
            leads = newLeads;

            updateDashboardUI();
            updateLeadsTableUI();
            updateInboxUI();
        }
    } catch (err) {
        console.error('Error polling data:', err);
    }
}

// Detect live updates to throw real-time desktop toast alerts
let previousLeadsState = {};
function detectLiveUpdates(newLeads) {
    newLeads.forEach(lead => {
        const prev = previousLeadsState[lead.id];
        if (prev) {
            // Check if open state changed to true
            if (!prev.email_opened && lead.email_opened) {
                showToast(
                    'Email Opened!', 
                    `Lead "${lead.name}" just opened the automated response email.`, 
                    'success'
                );
            }
            // Check if click state changed to true
            if (!prev.link_clicked && lead.link_clicked) {
                showToast(
                    'Link Clicked!', 
                    `Lead "${lead.name}" clicked the trackable link in the email.`, 
                    'click'
                );
            }
        }
        // Save current state for next poll
        previousLeadsState[lead.id] = {
            email_opened: lead.email_opened,
            link_clicked: lead.link_clicked
        };
    });
}

// Update dashboard widgets UI
function updateDashboardUI() {
    statTotalLeads.innerText = stats.totalLeads;
    statEmailsSent.innerText = stats.emailsSent;
    statEmailsOpened.innerText = stats.emailsOpened;
    statOpenRate.innerText = `${stats.openRate}%`;
    statLinksClicked.innerText = stats.linksClicked;
    statClickRate.innerText = `${stats.clickRate}%`;
}

// Render Leads database table
function updateLeadsTableUI() {
    if (leads.length === 0) {
        leadsTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-table">
                    <i class="fa-solid fa-folder-open"></i>
                    <p>No leads submitted yet. Use the "Capture Lead" tab to get started!</p>
                </td>
            </tr>
        `;
        return;
    }

    leadsTableBody.innerHTML = leads.map(lead => {
        // AI Category and Priority labels styling
        const categoryBadge = `<span class="badge-category">${escapeHTML(lead.ai_category)}</span>`;
        const priorityClass = lead.ai_priority.toLowerCase();
        const priorityBadge = `<span class="badge-priority ${priorityClass}">${escapeHTML(lead.ai_priority)}</span>`;

        // Tracking pillars
        const openStatus = lead.email_opened 
            ? `<span class="status-pill yes"><i class="status-dot"></i>Yes</span>`
            : `<span class="status-pill no"><i class="status-dot"></i>No</span>`;
        
        const clickStatus = lead.link_clicked 
            ? `<span class="status-pill yes"><i class="status-dot"></i>Yes</span>`
            : `<span class="status-pill no"><i class="status-dot"></i>No</span>`;

        return `
            <tr>
                <td>
                    <div class="lead-info-cell">
                        <span class="lead-name">${escapeHTML(lead.name)}</span>
                        <span class="lead-contact">${escapeHTML(lead.email)} | ${escapeHTML(lead.phone)}</span>
                    </div>
                </td>
                <td class="font-semibold">${escapeHTML(lead.company) || '<span class="text-muted">N/A</span>'}</td>
                <td>
                    <div class="lead-ai-cell">
                        ${categoryBadge}
                        ${priorityBadge}
                    </div>
                </td>
                <td><span class="status-pill yes"><i class="status-dot"></i>Yes</span></td>
                <td>${openStatus}</td>
                <td>${clickStatus}</td>
                <td><span class="time-stamp">${lead.submission_time}</span></td>
            </tr>
        `;
    }).join('');
}

// Render Simulator Inbox List
function updateInboxUI() {
    // Filter out leads that haven't sent emails (all leads have emails sent automatically in this architecture)
    const inboxLeads = leads;

    // Calculate unread badge count (leads where email is NOT opened)
    const unopenedCount = inboxLeads.filter(l => !l.email_opened).length;
    if (unopenedCount > 0) {
        inboxBadge.innerText = unopenedCount;
        inboxBadge.style.display = 'block';
    } else {
        inboxBadge.style.display = 'none';
    }

    if (inboxLeads.length === 0) {
        emailListBody.innerHTML = `
            <div class="empty-inbox">
                <i class="fa-regular fa-envelope"></i>
                <p>Inbox is empty. Submit a lead to trigger an automated email response.</p>
            </div>
        `;
        return;
    }

    emailListBody.innerHTML = inboxLeads.map(lead => {
        const isActive = lead.id === selectedEmailLeadId ? 'active' : '';
        const isOpened = lead.email_opened;
        
        // Short message excerpt
        const previewText = `We received your requirement: "${lead.requirement}"`;
        
        return `
            <div class="email-item ${isActive}" onclick="selectEmail(${lead.id})">
                <div class="email-item-header">
                    <span class="email-item-sender">Lead Response Simulation</span>
                    <span class="time-stamp">${lead.submission_time.split(' ')[1]}</span>
                </div>
                <div class="email-item-subject">Re: Inquiry from ${escapeHTML(lead.name)}</div>
                <div class="email-item-preview">${escapeHTML(previewText)}</div>
                <div class="email-item-tracking-stats">
                    <span class="email-item-stat opened">
                        <i class="fa-${isOpened ? 'solid' : 'regular'} fa-envelope-open"></i> 
                        ${isOpened ? 'Opened' : 'Unopened'}
                    </span>
                    <span class="email-item-stat clicked" style="color: ${lead.link_clicked ? 'var(--accent-blue)' : 'var(--text-muted)'}">
                        <i class="fa-solid fa-arrow-pointer"></i> 
                        ${lead.link_clicked ? 'Clicked' : 'Not Clicked'}
                    </span>
                </div>
            </div>
        `;
    }).join('');

    // If an email is currently selected, refresh its details view metadata too
    if (selectedEmailLeadId) {
        const lead = leads.find(l => l.id === selectedEmailLeadId);
        if (lead) {
            emailToField.innerText = `${escapeHTML(lead.name)} <${escapeHTML(lead.email)}>`;
            emailDateField.innerText = lead.submission_time;
        }
    }
}

// Select email in simulated inbox
function selectEmail(leadId) {
    selectedEmailLeadId = leadId;
    
    // Highlight list selection immediately
    document.querySelectorAll('.email-item').forEach(el => el.classList.remove('active'));
    
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    // Toggle view states
    emptyViewerState.style.display = 'none';
    emailDetailsContainer.style.display = 'flex';

    // Populate metadata fields
    emailToField.innerText = `${escapeHTML(lead.name)} <${escapeHTML(lead.email)}>`;
    emailSubjectField.innerText = `Thank you for reaching out, ${escapeHTML(lead.name)}!`;
    emailDateField.innerText = lead.submission_time;

    // Load iframe body content with tracking pixel and link redirect
    const host = window.location.origin;
    const trackingPixelUrl = `${host}/track/open/${lead.id}`;
    const clickTrackUrl = `${host}/track/click/${lead.id}`;

    // Elegant raw email template
    const emailHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {
                    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                    color: #334155;
                    line-height: 1.6;
                    padding: 30px;
                    margin: 0;
                    background-color: #ffffff;
                }
                .email-card {
                    max-width: 600px;
                    margin: 0 auto;
                    border: 1px solid #e2e8f0;
                    border-radius: 12px;
                    overflow: hidden;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
                }
                .email-header {
                    background: linear-gradient(135deg, #4f46e5, #7c3aed);
                    color: white;
                    padding: 24px;
                    text-align: center;
                }
                .email-header h1 {
                    margin: 0;
                    font-size: 20px;
                    font-weight: 700;
                }
                .email-body {
                    padding: 32px 24px;
                }
                .email-body p {
                    margin-bottom: 20px;
                    font-size: 15px;
                }
                .requirement-quote {
                    background-color: #f8fafc;
                    border-left: 4px solid #6366f1;
                    padding: 16px;
                    margin: 20px 0;
                    font-style: italic;
                    color: #475569;
                    border-radius: 0 8px 8px 0;
                    font-size: 14px;
                }
                .btn-wrapper {
                    text-align: center;
                    margin: 30px 0;
                }
                .track-btn {
                    display: inline-block;
                    background-color: #6366f1;
                    color: white !important;
                    text-decoration: none;
                    font-weight: 600;
                    padding: 12px 30px;
                    border-radius: 8px;
                    box-shadow: 0 4px 10px rgba(99, 102, 241, 0.3);
                    transition: transform 0.2s, background-color 0.2s;
                }
                .track-btn:hover {
                    background-color: #4f46e5;
                    transform: translateY(-1px);
                }
                .email-footer {
                    background-color: #f8fafc;
                    border-top: 1px solid #e2e8f0;
                    padding: 20px;
                    text-align: center;
                    font-size: 12px;
                    color: #94a3b8;
                }
            </style>
        </head>
        <body>
            <div class="email-card">
                <div class="email-header">
                    <h1>Lead Management & Email Tracking System</h1>
                </div>
                <div class="email-body">
                    <p>Hi <strong>${escapeHTML(lead.name)}</strong>,</p>
                    <p>Thank you for reaching out to us. We have received your submission details and our team is already reviewing your request.</p>
                    
                    <p>Here is a summary of the requirement you provided:</p>
                    <div class="requirement-quote">
                        "${escapeHTML(lead.requirement)}"
                    </div>
                    
                    <p>We've created a custom proposal path matching your requirement. Click the button below to view customized pricing models and schedule a live demo:</p>
                    
                    <div class="btn-wrapper">
                        <a href="${clickTrackUrl}" class="track-btn" target="_parent">View Customized Proposal &rarr;</a>
                    </div>
                    
                    <p>Regards,<br><strong>The Lead & Email Tracking Team</strong></p>
                </div>
                <div class="email-footer">
                    This email is sent automatically by the Lead Management & Email Tracking System.<br>
                    &copy; 2026 Lead Management & Email Tracking System. All rights reserved.
                </div>
            </div>
            
            <!-- Real-time open tracking pixel (triggers /track/open/:id) -->
            <img src="${trackingPixelUrl}" width="1" height="1" style="display:none !important;" />
        </body>
        </html>
    `;

    // Load HTML safely into iframe
    const doc = emailBodyIframe.contentDocument || emailBodyIframe.contentWindow.document;
    doc.open();
    doc.write(emailHTML);
    doc.close();

    // Trigger local list UI update
    updateInboxUI();
}

// Handle Lead capture form submission
async function handleFormSubmit(e) {
    e.preventDefault();

    const formData = new FormData(leadForm);
    const payload = {
        name: formData.get('name').trim(),
        email: formData.get('email').trim(),
        phone: formData.get('phone').trim(),
        company: formData.get('company').trim(),
        requirement: formData.get('requirement').trim()
    };

    try {
        const res = await fetch(`${API_URL}/api/leads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const data = await res.json();
            leadForm.reset();
            
            showToast(
                'Lead Submitted!', 
                `"${data.name}" added. Email response queued and sent.`, 
                'success'
            );
            
            // Auto switch to Inbox so they can interact with the email
            setTimeout(() => {
                switchTab('inbox-tab');
                selectEmail(data.id);
            }, 1000);
        } else {
            const errData = await res.json();
            showToast('Submission Failed', errData.error || 'Server error occurred.', 'error');
        }
    } catch (err) {
        showToast('Network Error', 'Could not reach backend API server.', 'error');
        console.error('Submit error:', err);
    }
}

// Display toast notifications helper
function showToast(title, message, type = 'success') {
    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }

    const toastIcon = toast.querySelector('.toast-icon');
    const toastTitle = toast.querySelector('.toast-title');
    const toastMessage = toast.querySelector('.toast-message');

    // Configure theme
    toastIcon.className = 'toast-icon';
    if (type === 'success') {
        toastIcon.classList.add('success');
        toastIcon.innerHTML = '<i class="fa-solid fa-check"></i>';
        toast.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        toast.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 20px rgba(16, 185, 129, 0.15)';
    } else if (type === 'click') {
        toastIcon.classList.add('click');
        toastIcon.innerHTML = '<i class="fa-solid fa-arrow-pointer"></i>';
        toast.style.borderColor = 'rgba(59, 130, 246, 0.3)';
        toast.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 20px rgba(59, 130, 246, 0.15)';
    } else {
        toastIcon.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        toast.style.borderColor = 'rgba(244, 63, 94, 0.3)';
        toast.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 20px rgba(244, 63, 94, 0.15)';
    }

    toastTitle.innerText = title;
    toastMessage.innerText = message;
    
    toast.classList.add('show');

    // Auto dismiss after 4 seconds
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

// Escape HTML tags to prevent XSS vulnerability
function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

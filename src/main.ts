import './index.css';
import 'katex/dist/katex.min.css';
// @ts-ignore
import renderMathInElement from 'katex/dist/contrib/auto-render.mjs';
import { io } from 'socket.io-client';
import { getLandingContent } from './pages/landing';
import { getLoginContent } from './pages/login';
import { getRegisterContent } from './pages/register';
import { getDashboardContent } from './pages/dashboard';
import { getArchivesContent } from './pages/archives';
import { getSavedContent } from './pages/saved';
import { getSettingsContent } from './pages/settings';
import { getDiscussionContent } from './pages/discussion';
import { getQuestionDetailContent } from './pages/questionDetail';
import { getMatchesContent } from './pages/matches';
import { getChatContent } from './pages/chat';

// Initialize Theme state on boot
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark') {
  document.documentElement.classList.add('dark');
} else {
  document.documentElement.classList.remove('dark');
}

let socket: any = null;
let currentChatUserId: string | null = null;

function getMobileNavContent(currentPath: string) {
  const links = [
    { href: '/dashboard', icon: 'book_2', label: 'Library' },
    { href: '/archives', icon: 'auto_stories', label: 'Archives' },
    { href: '/saved', icon: 'bookmark', label: 'Saved' },
    { href: '/discussion', icon: 'forum', label: 'Discuss' },
    { href: '/matches', icon: 'handshake', label: 'Matches' }
  ];

  return `
    <nav class="md:hidden fixed bottom-0 left-0 w-full bg-surface-container-low border-t border-surface-container-highest z-[100] pb-safe shadow-[0_-4px_16px_rgba(0,0,0,0.05)]">
      <div class="flex items-center justify-around px-2 py-2">
        ${links.map(link => {
          const isActive = currentPath === link.href || (currentPath.startsWith('/discussion') && link.href === '/discussion') || (currentPath.startsWith('/chat') && link.href === '/matches');
          const colorClass = isActive ? 'text-primary' : 'text-outline hover:text-on-surface-variant';
          const iconClass = isActive ? 'fill-icon' : '';
          const bgClass = isActive ? 'bg-primary-container/20 font-bold' : '';
          return `
            <a href="${link.href}" data-link class="flex flex-col items-center justify-center min-w-[60px] p-2 rounded-xl border border-transparent ${colorClass} ${bgClass} transition-colors gap-0.5 relative">
              <span class="material-symbols-outlined text-[24px] ${iconClass}" data-icon="${link.icon}">${link.icon}</span>
              <span class="text-[9px] font-label tracking-wide uppercase">${link.label}</span>
              ${link.href === '/matches' ? '<span id="mobile-nav-badge-matches" class="absolute top-1.5 right-3 w-2.5 h-2.5 rounded-full bg-error border-2 border-surface-container-low hidden"></span>' : ''}
            </a>
          `;
        }).join('')}
      </div>
    </nav>
    <div class="md:hidden h-20 w-full shrink-0"></div>
  `;
}

const applyMathJax = () => {
  setTimeout(() => {
    const root = document.getElementById('root');
    if (root) {
      renderMathInElement(root, {
        delimiters: [
          {left: '$$', right: '$$', display: true},
          {left: '$', right: '$', display: false},
          {left: '\\(', right: '\\)', display: false},
          {left: '\\[', right: '\\]', display: true}
        ],
        throwOnError: false
      });
    }
  }, 50);
};

function showConfirm(title: string, message: string, onConfirm: () => void) {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-on-surface/40 backdrop-blur-sm animate-in fade-in duration-300';
  
  overlay.innerHTML = `
    <div class="bg-surface w-full max-w-sm rounded-[2rem] shadow-2xl border border-outline-variant/10 p-8 transform animate-in zoom-in-95 duration-300">
      <div class="w-16 h-16 bg-error/10 text-error rounded-full flex items-center justify-center mb-6">
        <span class="material-symbols-outlined text-3xl">block</span>
      </div>
      <h3 class="font-headline text-2xl font-bold text-on-surface mb-2">${title}</h3>
      <p class="font-body text-on-surface-variant text-sm mb-8 leading-relaxed">${message}</p>
      <div class="flex flex-col gap-3">
        <button id="modal-confirm" class="w-full bg-error text-on-error rounded-xl py-3 font-label font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-95">Block User</button>
        <button id="modal-cancel" class="w-full bg-surface-container hover:bg-surface-container-high text-on-surface rounded-xl py-3 font-label font-bold text-sm transition-all active:scale-95">Keep Chatting</button>
      </div>
    </div>
  `;
  
  overlay.querySelector('#modal-confirm')?.addEventListener('click', () => {
    onConfirm();
    overlay.remove();
  });
  
  overlay.querySelector('#modal-cancel')?.addEventListener('click', () => {
    overlay.remove();
  });
  
  document.body.appendChild(overlay);
}

function initSocket(userId: string) {
  if (!socket) {
    socket = io();
    socket.emit('join', userId);
    
    socket.on('receive_message', (msg: any) => {
      // If we are on the chat page and the message belongs to this conversation
      if (currentChatUserId && (msg.senderId === currentChatUserId || msg.senderId === userId)) {
        appendMessage(msg, userId);
        // If it's from the other person, mark it as read immediately
        if (msg.senderId === currentChatUserId) {
           fetch(`/api/messages/${currentChatUserId}/read`, {
              method: 'PUT',
              headers: { 'Authorization': `Bearer ${localStorage.getItem('peerlearn_token')}` }
           }).then(() => refreshNotificationStatus());
        }
      } else if (msg.senderId !== userId) {
        console.log("New message from", msg.senderId);
        refreshNotificationStatus();
      }
    });

    socket.on('notification', (data: any) => {
      showNotification(data.message, data.type, data.senderId);
      refreshNotificationStatus();
    });
  }
}

async function refreshNotificationStatus() {
  const token = localStorage.getItem('peerlearn_token');
  if (!token) return;
  try {
    const res = await fetch('/api/users/notifications/status', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const status = await res.json();
      updateBadges(status);
    }
  } catch (err) { console.error(err); }
}

function updateBadges(status: any) {
  const total = (status.pendingRequestsCount || 0) + (status.unreadMessagesCount || 0);

  // Desktop sidebar badge
  const desktopMatchesLink = document.querySelector('a[href="/matches"]');
  if (desktopMatchesLink) {
    let badge = document.getElementById('matches-sidebar-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'matches-sidebar-badge';
      badge.className = 'ml-auto bg-error text-on-error text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shrink-0';
      desktopMatchesLink.appendChild(badge);
    }
    if (total > 0) {
      badge.textContent = total > 99 ? '99+' : total.toString();
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }

  // Mobile nav badge
  const mobileBadge = document.getElementById('mobile-nav-badge-matches');
  if (mobileBadge) {
     if (total > 0) {
       mobileBadge.classList.remove('hidden');
     } else {
       mobileBadge.classList.add('hidden');
     }
  }

  // Also update match cards if on matches page
  if (window.location.pathname === '/matches' && status.unreadByPeer) {
     Object.keys(status.unreadByPeer).forEach(peerId => {
        const dot = document.querySelector(`.unread-dot-${peerId}`);
        if (dot) dot.classList.remove('hidden');
     });
  }
}

function openPreviewModal(url: string, title: string) {
  // Check for PDF in the full URL string as a more robust fallback for signed URLs
  const lowerUrl = url.toLowerCase();
  const isPdf = lowerUrl.includes('.pdf') || lowerUrl.includes('image/upload') && lowerUrl.includes('/v');
  
  // Parse extension from path if possible
  const pathPart = url.split('?')[0];
  const extMatch = pathPart.match(/\.([^./?]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';
  
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext) || (!isPdf && lowerUrl.includes('image/upload'));
  
  let contentHtml = '';
  
  if (isImage) {
    contentHtml = `<img src="${url}" alt="${title}" class="max-w-full max-h-[70vh] object-contain mx-auto rounded-lg shadow-sm" />`;
  } else if (isPdf) {
    contentHtml = `
      <div class="w-full h-full min-h-[70vh] flex flex-col">
        <iframe src="${url}" class="flex-1 w-full rounded-lg border-none shadow-sm bg-surface"></iframe>
        <div class="mt-2 text-center">
          <p class="text-[10px] text-outline">Viewing via Browser PDF viewer. Having trouble? <a href="${url}" target="_blank" class="text-primary hover:underline">Open in new tab</a></p>
        </div>
      </div>
    `;
  } else {
    contentHtml = `
      <div class="flex flex-col items-center justify-center p-12 text-center bg-surface-container-low rounded-lg h-full min-h-[60vh]">
        <span class="material-symbols-outlined text-6xl text-outline mb-4">do_not_disturb</span>
        <h3 class="font-headline text-2xl font-bold text-on-surface mb-2">Preview Not Available</h3>
        <p class="font-body text-on-surface-variant mb-8 max-w-md">This file type (.${ext || 'unknown'}) cannot be previewed in the browser. Please download the file to view its contents.</p>
        <a href="${url}" target="_blank" class="bg-primary text-on-primary px-8 py-3 rounded-xl font-label font-bold flex items-center gap-2 hover:shadow-lg transition-all active:scale-95">
          <span class="material-symbols-outlined">download</span>
          Download File
        </a>
      </div>
    `;
  }

  const modalOverlay = document.createElement('div');
  modalOverlay.className = "fixed inset-0 z-[200] flex items-center justify-center bg-on-surface/60 backdrop-blur-sm p-4 md:p-8 duration-200 transition-opacity opacity-0";
  modalOverlay.innerHTML = `
    <div class="bg-surface-container-lowest w-full max-w-5xl max-h-full rounded-[1.5rem] shadow-2xl border border-outline-variant/20 transform scale-95 transition-all duration-300 show-modal-content flex flex-col overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between p-5 border-b border-outline-variant/20 bg-surface/50 backdrop-blur-md">
        <div class="flex items-center gap-3 pr-4 overflow-hidden">
           <div class="w-10 h-10 rounded-lg bg-primary-container text-on-primary-container flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined">${isImage ? 'image' : isPdf ? 'picture_as_pdf' : 'description'}</span>
           </div>
           <h3 class="font-headline font-bold text-xl text-on-surface truncate">${title}</h3>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <a href="${url}" target="_blank" class="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-primary-container/20 rounded-full transition-colors" title="Download">
            <span class="material-symbols-outlined">download</span>
          </a>
          <button id="close-preview-btn" class="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error-container/20 rounded-full transition-colors" title="Close Preview">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
      </div>
      <!-- Content -->
      <div class="p-4 md:p-6 overflow-auto bg-surface flex-1 relative flex items-center justify-center min-h-[60vh]">
         ${contentHtml}
      </div>
    </div>
  `;

  document.body.appendChild(modalOverlay);
  
  // Trigger animation
  requestAnimationFrame(() => {
     modalOverlay.classList.remove('opacity-0');
     modalOverlay.querySelector('.show-modal-content')?.classList.remove('scale-95');
  });

  const closeModal = () => {
    modalOverlay.classList.add('opacity-0');
    modalOverlay.querySelector('.show-modal-content')?.classList.add('scale-95');
    setTimeout(() => modalOverlay.remove(), 250);
  };

  modalOverlay.querySelector('#close-preview-btn')?.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });
}

function showNotification(message: string, type: string, senderId?: string) {
  const container = document.getElementById('notification-center');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'w-full max-w-sm bg-surface-container-highest border border-outline-variant/30 rounded-2xl p-4 shadow-2xl flex items-start gap-4 animate-in slide-in-from-right-full duration-300 transform transition-all cursor-pointer hover:bg-surface-container-high z-[9999]';
  
  let icon = 'notifications';
  let colorClass = 'text-primary';
  
  if (type === 'NEW_MESSAGE') icon = 'chat';
  if (type === 'CONNECT_REQUEST' || type === 'CONNECT_ACCEPTED') icon = 'handshake';
  
  toast.innerHTML = `
    <div class="w-10 h-10 rounded-xl bg-surface-variant flex items-center justify-center shrink-0">
      <span class="material-symbols-outlined ${colorClass}">${icon}</span>
    </div>
    <div class="flex-1">
      <p class="font-body text-sm font-semibold text-on-surface line-clamp-2">${message}</p>
      <p class="font-label text-[10px] text-on-surface-variant mt-1">Tap to view</p>
    </div>
    <button class="text-outline hover:text-on-surface transition-colors">
      <span class="material-symbols-outlined text-sm">close</span>
    </button>
  `;

  toast.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('button')) {
      toast.remove();
      return;
    }
    
    if (type === 'NEW_MESSAGE' && senderId) {
       window.history.pushState({}, '', `/chat/${senderId}`);
       render();
    } else if (type.startsWith('CONNECT')) {
       window.history.pushState({}, '', `/matches`);
       render();
    }
    toast.remove();
  });

  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-x-full');
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

function appendMessage(msg: any, myUserId: string) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  
  const isMine = msg.senderId === myUserId;
  const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  const div = document.createElement('div');
  div.className = `flex w-full ${isMine ? 'justify-end' : 'justify-start'}`;
  div.innerHTML = `
    <div class="max-w-[75%] rounded-2xl px-5 py-3 ${isMine ? 'bg-primary text-on-primary rounded-br-sm' : 'bg-surface-container border border-outline-variant/10 text-on-surface rounded-bl-sm'} shadow-sm">
      <p class="font-body text-sm whitespace-pre-wrap">${escapeHTML(msg.text)}</p>
      <div class="text-[10px] ${isMine ? 'text-primary-container opacity-80' : 'text-on-surface-variant'} mt-1 text-right font-label">${time}</div>
    </div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function escapeHTML(str: string) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function addRoutingEvents() {
  document.querySelectorAll('a[data-link]').forEach(el => {
    // Only attach once
    if (el.hasAttribute('data-router-attached')) return;
    el.setAttribute('data-router-attached', 'true');
    
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const href = (el as HTMLAnchorElement).getAttribute('href');
      if (href) {
        window.history.pushState({}, '', href);
        render();
      }
    });
  });

  // Handle Google Popup Auth Event listening
  if (!window.hasOwnProperty('oauthListenerAttached')) {
     (window as any).oauthListenerAttached = true;
     window.addEventListener('message', (event: MessageEvent) => {
       const origin = event.origin;
       if (origin !== window.location.origin) {
         return;
       }
       if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
          // Received token and user from backend!
          localStorage.setItem('peerlearn_token', event.data.token);
          localStorage.setItem('peerlearn_user', JSON.stringify(event.data.user));
          
          window.history.pushState({}, '', '/dashboard');
          render();
       } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
          const path = window.location.pathname;
          if (path === '/register') {
             const errorDiv = document.getElementById('register-global-error');
             if (errorDiv) {
                errorDiv.classList.remove('hidden');
                errorDiv.innerText = event.data.message;
             }
          } else if (path === '/login') {
             const errorDiv = document.getElementById('login-global-error');
             if (errorDiv) {
                errorDiv.classList.remove('hidden');
                errorDiv.innerText = event.data.message;
             }
          } else {
             alert(event.data.message);
          }
       }
     });
  }

  const handleGoogleClick = async (intent: 'login' | 'register') => {
      try {
         const redirectUri = encodeURIComponent(`${window.location.origin}/api/auth/google/callback`);
         const res = await fetch(`/api/auth/google/url?redirectUri=${redirectUri}&intent=${intent}`);
         const data = await res.json();
         if (data.url) {
             const authWindow = window.open(data.url, 'oauth_popup', 'width=600,height=700');
             if (!authWindow) alert('Please allow popups to sign in with Google.');
         }
      } catch (err) {
         console.error('Failed to start Google OAuth:', err);
      }
  };

  const googleLoginBtn = document.getElementById('google-login-btn');
  if (googleLoginBtn && !googleLoginBtn.hasAttribute('data-attached')) {
     googleLoginBtn.setAttribute('data-attached', 'true');
     googleLoginBtn.addEventListener('click', () => handleGoogleClick('login'));
  }

  const googleRegisterBtn = document.getElementById('google-register-btn');
  if (googleRegisterBtn && !googleRegisterBtn.hasAttribute('data-attached')) {
     googleRegisterBtn.setAttribute('data-attached', 'true');
     googleRegisterBtn.addEventListener('click', () => handleGoogleClick('register'));
  }

  // Password Visibility Toggle
  const togglePasswordBtn = document.getElementById('toggle-password');
  const passwordInput = document.getElementById('password') as HTMLInputElement;
  const toggleIcon = document.getElementById('toggle-password-icon');
  
  if (togglePasswordBtn && passwordInput && toggleIcon) {
    togglePasswordBtn.addEventListener('click', () => {
      if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleIcon.textContent = 'visibility_off';
      } else {
        passwordInput.type = 'password';
        toggleIcon.textContent = 'visibility';
      }
    });
  }

  const loginForm = document.getElementById('login-form') as HTMLFormElement;
  if (loginForm && !loginForm.hasAttribute('data-form-attached')) {
    loginForm.setAttribute('data-form-attached', 'true');
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = (document.getElementById('email') as HTMLInputElement).value;
      const password = (document.getElementById('password') as HTMLInputElement).value;
      const errorDiv = document.getElementById('login-error');
      const submitBtn = loginForm.querySelector('button[type="submit"]') as HTMLButtonElement;
      
      if(errorDiv) errorDiv.classList.add('hidden');
      submitBtn.disabled = true;
      submitBtn.innerText = "Signing in...";

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.message || 'Login failed');
        }

        // Store JWT
        localStorage.setItem('peerlearn_token', data.token);
        localStorage.setItem('peerlearn_user', JSON.stringify(data.user));
        
        window.history.pushState({}, '', '/dashboard');
        render();
      } catch (err: any) {
        if(errorDiv) {
          errorDiv.classList.remove('hidden');
          errorDiv.innerText = err.message || "An error occurred";
        }
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Sign In";
      }
    });
  }

  const registerForm = document.getElementById('register-form') as HTMLFormElement;
  if (registerForm && !registerForm.hasAttribute('data-form-attached')) {
    registerForm.setAttribute('data-form-attached', 'true');
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fullName = (document.getElementById('fullName') as HTMLInputElement).value;
      const email = (document.getElementById('email') as HTMLInputElement).value;
      const interest = (document.getElementById('interest') as HTMLSelectElement).value;
      const password = (document.getElementById('password') as HTMLInputElement).value;
      
      const errorDiv = document.getElementById('register-error');
      const submitBtn = document.getElementById('register-submit-btn') as HTMLButtonElement;
      
      if(errorDiv) errorDiv.classList.add('hidden');
      submitBtn.disabled = true;
      submitBtn.innerText = "Signing up...";

      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName, email, interest, password })
        });
        
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.message || 'Registration failed');
        }

        if (data.status === 'pending_verification') {
           // Show success message and hide form
           registerForm.innerHTML = `
             <div class="text-center py-10">
               <div class="w-16 h-16 rounded-full bg-success-container text-on-success-container flex items-center justify-center mx-auto mb-6 shadow-md">
                 <span class="material-symbols-outlined text-3xl">mail</span>
               </div>
               <h3 class="font-headline text-2xl font-bold text-on-surface mb-3">Check Your Email</h3>
               <p class="font-body text-on-surface-variant max-w-sm mx-auto mb-6">${data.message}</p>
               <a href="/login" data-link class="inline-block bg-primary text-on-primary px-6 py-2.5 rounded-full font-label font-bold shadow-md hover:bg-primary/90 transition-colors">Go to Login</a>
             </div>
           `;
           // Re-attach router to the new button
           addRoutingEvents();
        } else {
           // Auto-verify fallback (if SMTP was disabled)
           localStorage.setItem('peerlearn_token', data.token);
           localStorage.setItem('peerlearn_user', JSON.stringify(data.user));
           window.history.pushState({}, '', '/dashboard');
           render();
        }

      } catch (err: any) {
        if(errorDiv) {
          errorDiv.classList.remove('hidden');
          errorDiv.innerText = err.message || "An error occurred";
        }
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Sign Up";
      }
    });
  }

  // Dashboard Load & Interaction Logic
  const initDashboard = async () => {
    const uploadForm = document.getElementById('upload-form') as HTMLFormElement;
    const resourcesList = document.getElementById('resources-list');
    const navActions = document.getElementById('nav-actions');
    const searchInput = document.getElementById('dashboard-search-input') as HTMLInputElement;
    
    const token = localStorage.getItem('peerlearn_token');
    const user = JSON.parse(localStorage.getItem('peerlearn_user') || 'null');

    // Populate user profile actions
    if (navActions && user) {
      // Logic handled globally by render() now via attachProfileLogic
    }

    const fetchDashboardResources = async (query = '') => {
      // Re-read user to ensure we have latest savedResources
      const currentUser = JSON.parse(localStorage.getItem('peerlearn_user') || 'null');
      
      if (!resourcesList) return;
      try {
        const url = query ? `/api/resources?search=${encodeURIComponent(query)}` : '/api/resources';
        const res = await fetch(url);
        const data = await res.json();
        
        if(data.length === 0) {
          resourcesList.innerHTML = `<p class="font-body text-on-surface-variant p-6 bg-surface-container-lowest rounded-xl">${query ? 'No resources matched your search.' : 'No resources uploaded yet. Be the first!'}</p>`;
        } else {
          resourcesList.innerHTML = data.map((r: any) => {
            const isSaved = currentUser && currentUser.savedResources && currentUser.savedResources.includes(r._id);
            const bookmarkIconClass = isSaved ? "fill-icon" : "";
            const bookmarkContainerClass = isSaved ? "text-primary bg-primary-container hover:bg-primary-container/80" : "text-outline hover:bg-surface-variant";
            
            return `
            <article class="group bg-surface-container-lowest rounded-xl p-5 hover:bg-surface-container-low transition-colors duration-200 cursor-pointer flex flex-col sm:flex-row sm:items-center gap-5 relative">
              <div class="w-12 h-12 rounded-lg bg-primary-fixed flex-shrink-0 flex items-center justify-center text-on-primary-fixed">
                <span class="material-symbols-outlined">description</span>
              </div>
              <div class="flex-1">
                <h4 class="font-headline text-lg font-bold text-primary mb-1 group-hover:text-primary-container transition-colors">${r.title}</h4>
                <div class="flex flex-wrap items-center gap-3 text-xs font-label text-on-surface-variant">
                  <span class="flex items-center"><span class="material-symbols-outlined text-[14px] mr-1">person</span> ${r.uploader ? r.uploader.fullName : 'Unknown'}</span>
                  <span>•</span>
                  <span>Added ${new Date(r.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div class="flex items-center gap-2 mt-4 sm:mt-0 z-10 relative">
                <span class="px-2.5 py-1 rounded bg-tertiary-container/10 text-tertiary text-xs font-medium mr-2">${r.subject}</span>
                <button class="preview-resource-btn w-8 h-8 rounded-full hover:bg-surface-variant flex items-center justify-center text-outline transition-colors" data-url="${r.fileUrl}" data-title="${r.title}" title="Preview Resource">
                  <span class="material-symbols-outlined text-sm">visibility</span>
                </button>
                <a href="${r.fileUrl}" target="_blank" class="w-8 h-8 rounded-full hover:bg-surface-variant flex items-center justify-center text-outline transition-colors" title="Download Resource">
                  <span class="material-symbols-outlined text-sm">download</span>
                </a>
                ${currentUser ? `
                <button class="toggle-save-btn w-8 h-8 rounded-full flex items-center justify-center transition-colors ${bookmarkContainerClass}" data-id="${r._id}" title="${isSaved ? 'Remove from Bookmarks' : 'Save to Bookmarks'}">
                  <span class="material-symbols-outlined text-sm ${bookmarkIconClass}">bookmark</span>
                </button>
                ` : ''}
              </div>
            </article>
            `;
          }).join('');
        }
      } catch (e) {
         resourcesList.innerHTML = `<p class="text-error font-body">Failed to load resources.</p>`;
      }
    };

    // Initial Fetch
    fetchDashboardResources();

    // Setup global dashboard list listeners (preview)
    resourcesList?.addEventListener('click', async (e) => {
      const btn = (e.target as HTMLElement).closest('.preview-resource-btn') as HTMLButtonElement;
      if (btn) {
        const url = btn.getAttribute('data-url');
        const title = btn.getAttribute('data-title');
        if (url && title) openPreviewModal(url, title);
        return;
      }
      
      const saveBtn = (e.target as HTMLElement).closest('.toggle-save-btn') as HTMLButtonElement;
      if (saveBtn) {
        e.stopPropagation();
        const resourceId = saveBtn.dataset.id;
        if (resourceId && token) {
           try {
             saveBtn.style.opacity = '0.5';
             const res = await fetch(`/api/resources/${resourceId}/save`, {
               method: 'POST',
               headers: { 'Authorization': `Bearer ${token}` }
             });
             if (res.ok) {
               const savedData = await res.json();
               localStorage.setItem('peerlearn_user', JSON.stringify(savedData.user));
               
               // Instant UI Toggle (no fetch needed)
               const iconSpan = saveBtn.querySelector('span');
               if (iconSpan) {
                 if (savedData.saved) {
                   saveBtn.className = "toggle-save-btn w-8 h-8 rounded-full flex items-center justify-center transition-colors text-primary bg-primary-container hover:bg-primary-container/80";
                   saveBtn.title = "Remove from Bookmarks";
                   iconSpan.className = "material-symbols-outlined text-sm fill-icon";
                 } else {
                   saveBtn.className = "toggle-save-btn w-8 h-8 rounded-full flex items-center justify-center transition-colors text-outline hover:bg-surface-variant";
                   saveBtn.title = "Save to Bookmarks";
                   iconSpan.className = "material-symbols-outlined text-sm";
                 }
               }
             }
           } catch (err) {
             console.error("Failed to toggle save", err);
           } finally {
             saveBtn.style.opacity = '1';
           }
        }
      }
    });

    // Attach Search Listener
    if (searchInput && !searchInput.hasAttribute('data-listener-attached')) {
      searchInput.setAttribute('data-listener-attached', 'true');
      let searchTimeout: any;
      searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          fetchDashboardResources(searchInput.value.trim());
        }, 300);
      });
    }

    // Attach File Input Listener for filename display
    const fileInput = document.getElementById('resource-file') as HTMLInputElement;
    const fileNameDisplay = document.getElementById('file-name-display');
    if (fileInput && fileNameDisplay && !fileInput.hasAttribute('data-listener-attached')) {
      fileInput.setAttribute('data-listener-attached', 'true');
      fileInput.addEventListener('change', (e) => {
        if (fileInput.files && fileInput.files.length > 0) {
          fileNameDisplay.textContent = fileInput.files[0].name;
        } else {
          fileNameDisplay.textContent = 'PDF, EPUB, or DOCX (max. 50MB)';
        }
      });
    }

    // Attach "Other" subject toggle
    const subjectSelect = document.getElementById('resource-subject') as HTMLSelectElement;
    const subjectOtherContainer = document.getElementById('resource-subject-other-container');
    const subjectOtherInput = document.getElementById('resource-subject-other') as HTMLInputElement;

    if (subjectSelect && subjectOtherContainer && !subjectSelect.hasAttribute('data-toggle-attached')) {
      subjectSelect.setAttribute('data-toggle-attached', 'true');
      subjectSelect.addEventListener('change', () => {
        if (subjectSelect.value === 'Other') {
          subjectOtherContainer.classList.remove('hidden');
          subjectOtherInput.setAttribute('required', 'true');
        } else {
          subjectOtherContainer.classList.add('hidden');
          subjectOtherInput.removeAttribute('required');
        }
      });
    }

    // Upload Form Submit
    if (uploadForm && !uploadForm.hasAttribute('data-form-attached')) {
      uploadForm.setAttribute('data-form-attached', 'true');
      uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const title = (document.getElementById('resource-title') as HTMLInputElement).value;
        let subject = (document.getElementById('resource-subject') as HTMLSelectElement).value;
        const otherSubject = (document.getElementById('resource-subject-other') as HTMLInputElement)?.value;
        
        if (subject === 'Other' && otherSubject) {
          subject = otherSubject.trim();
        }

        const desc = (document.getElementById('resource-desc') as HTMLTextAreaElement).value;
        const fileInput = document.getElementById('resource-file') as HTMLInputElement;
        
        const errorDiv = document.getElementById('upload-error');
        const successDiv = document.getElementById('upload-success');
        const submitBtn = document.getElementById('upload-btn') as HTMLButtonElement;

        if (errorDiv) errorDiv.classList.add('hidden');
        if (successDiv) successDiv.classList.add('hidden');
        
        if (!fileInput.files || fileInput.files.length === 0) {
          if (errorDiv) { errorDiv.innerText = "Please select a file to upload."; errorDiv.classList.remove('hidden'); }
          return;
        }

        submitBtn.disabled = true;
        submitBtn.innerText = "Uploading to Cloudinary...";

        const formData = new FormData();
        formData.append('title', title);
        formData.append('subject', subject);
        formData.append('description', desc);
        formData.append('file', fileInput.files[0]);

        try {
          const res = await fetch('/api/resources/upload', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            },
            body: formData
          });

          let data;
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.indexOf("application/json") !== -1) {
            data = await res.json();
          } else {
            const text = await res.text();
            console.error("Non-JSON response from server:", text);
            throw new Error(`Server returned non-JSON response: ${text.substring(0, 100)}...`);
          }

          if (!res.ok) throw new Error(data.message || 'Upload failed');
          
          if(successDiv) {
            successDiv.innerText = "File uploaded successfully!";
            successDiv.classList.remove('hidden');
          }
          uploadForm.reset();
          if (subjectOtherContainer) {
            subjectOtherContainer.classList.add('hidden');
            subjectOtherInput.removeAttribute('required');
          }
          
          // Re-fetch list
          initDashboard();
        } catch (err: any) {
          if(errorDiv) {
            errorDiv.innerText = err.message || "An error occurred";
            errorDiv.classList.remove('hidden');
          }
        } finally {
          submitBtn.disabled = false;
          submitBtn.innerText = "Upload Resource";
        }
      });
    }
  };

  if (window.location.pathname === '/dashboard') {
     initDashboard();
  }
}

// Generic function to attach profile dropdown logic
function attachProfileLogic(containerSelector: string, user: any) {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  container.innerHTML = `
    <div class="relative group mt-1">
      <button id="profile-dropdown-btn" class="flex items-center gap-2 px-4 py-2 rounded-full border border-outline-variant/30 hover:bg-surface-container-low transition-colors duration-200">
         <span class="font-body text-sm font-semibold text-primary">${user.fullName.split(' ')[0]}</span>
         <span class="material-symbols-outlined text-sm text-outline">expand_more</span>
      </button>
      
      <!-- Dropdown Menu -->
      <div id="profile-dropdown-menu" class="absolute right-0 mt-2 w-48 bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform origin-top-right z-50">
        <div class="p-2">
           <button id="logout-btn" class="w-full text-left px-4 py-3 font-body text-sm text-error hover:bg-error/10 rounded-lg flex items-center gap-2 transition-colors">
              <span class="material-symbols-outlined text-sm">logout</span> Logout
           </button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('peerlearn_token');
    localStorage.removeItem('peerlearn_user');
    window.history.pushState({}, '', '/');
    render();
  });
}

function render() {
  const path = window.location.pathname;
  const root = document.getElementById('root');
  if (!root) return;

  const token = localStorage.getItem('peerlearn_token');
  const user = JSON.parse(localStorage.getItem('peerlearn_user') || 'null');
  const isLoggedIn = !!(token && user);

  // Persistent Notification Center
  if (!document.getElementById('notification-center')) {
    const nc = document.createElement('div');
    nc.id = 'notification-center';
    nc.className = 'fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none';
    // Make children allow pointer events
    nc.style.cssText = 'pointer-events: none;';
    document.body.appendChild(nc);
    
    // Add custom style for pointer events on children
    const style = document.createElement('style');
    style.innerHTML = '#notification-center shadow-root > *, #notification-center > * { pointer-events: auto; }';
    document.head.appendChild(style);
  }

  if (isLoggedIn) {
     initSocket(user.id);
     refreshNotificationStatus();
  }

  if (path === '/login') {
    root.innerHTML = getLoginContent();
  } else if (path === '/register') {
    root.innerHTML = getRegisterContent();
  } else if (path === '/dashboard') {
    // Check auth
    if(!isLoggedIn) {
       window.history.pushState({}, '', '/login');
       render();
       return;
    }
    root.innerHTML = getDashboardContent();
  } else if (path === '/archives') {
    if(!isLoggedIn) {
       window.history.pushState({}, '', '/login');
       render();
       return;
    }
    root.innerHTML = getArchivesContent();
  } else if (path === '/saved') {
    if(!isLoggedIn) {
       window.history.pushState({}, '', '/login');
       render();
       return;
    }
    root.innerHTML = getSavedContent();
  } else if (path === '/settings') {
    if(!isLoggedIn) {
       window.history.pushState({}, '', '/login');
       render();
       return;
    }
    root.innerHTML = getSettingsContent();
  } else if (path === '/discussion') {
    if(!isLoggedIn) {
       window.history.pushState({}, '', '/login');
       render();
       return;
    }
    root.innerHTML = getDiscussionContent();
  } else if (path.startsWith('/discussion/')) {
    if(!isLoggedIn) {
       window.history.pushState({}, '', '/login');
       render();
       return;
    }
    root.innerHTML = getQuestionDetailContent();
  } else if (path === '/matches') {
    if(!isLoggedIn) {
       window.history.pushState({}, '', '/login');
       render();
       return;
    }
    root.innerHTML = getMatchesContent();
  } else if (path.startsWith('/chat/')) {
    if(!isLoggedIn) {
       window.history.pushState({}, '', '/login');
       render();
       return;
    }
    const otherUserId = path.split('/')[2];
    root.innerHTML = getChatContent(otherUserId);
  } else {
    root.innerHTML = getLandingContent(isLoggedIn);
  }

  // Handle logged-in UI states for standard pages
  if (isLoggedIn) {
    const validInternalPages = ['/dashboard', '/archives', '/saved', '/settings', '/discussion', '/matches'];
    const isInternalPage = validInternalPages.includes(path) || path.startsWith('/discussion/') || path.startsWith('/chat/');
    
    if (isInternalPage && !['/', '/login', '/register'].includes(path)) {
       root.insertAdjacentHTML('beforeend', getMobileNavContent(path));
    }

    if (path === '/') {
       attachProfileLogic('header .header-actions', user);
    } else if (isInternalPage) {
       attachProfileLogic('#nav-actions', user);
       attachProfileLogic('#mobile-nav-actions', user);
    }
  }

  applyMathJax();

  // Define data fetcher for archives
  if (path === '/archives' && isLoggedIn) {
    const archivesList = document.getElementById('archives-list');
    const searchInput = document.getElementById('archives-search-input') as HTMLInputElement;

    const fetchArchives = (query = '') => {
      if (!archivesList) return;
      const url = query ? `/api/resources/me?search=${encodeURIComponent(query)}` : '/api/resources/me';

      fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if(data.length === 0) {
          archivesList.innerHTML = `<p class="font-body text-on-surface-variant p-6 bg-surface-container-lowest rounded-xl border border-outline-variant/10">${query ? 'No archives matched your search.' : 'You haven\'t uploaded any resources yet.'}</p>`;
        } else {
          archivesList.innerHTML = data.map((r: any) => `
            <article class="group bg-surface-container-lowest rounded-xl p-5 hover:bg-surface-container-low transition-colors duration-200 cursor-pointer flex flex-col sm:flex-row sm:items-center gap-5 relative border border-outline-variant/10">
              <div class="w-12 h-12 rounded-lg bg-primary-fixed flex-shrink-0 flex items-center justify-center text-on-primary-fixed">
                <span class="material-symbols-outlined">description</span>
              </div>
              <div class="flex-1">
                <h4 class="font-headline text-lg font-bold text-primary mb-1 group-hover:text-primary-container transition-colors">${r.title}</h4>
                <div class="flex flex-wrap items-center gap-3 text-xs font-label text-on-surface-variant">
                  <span class="flex items-center"><span class="material-symbols-outlined text-[14px] mr-1">person</span> ${r.uploader ? r.uploader.fullName : 'You'}</span>
                  <span>•</span>
                  <span>Added ${new Date(r.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div class="flex items-center gap-2 mt-4 sm:mt-0 z-10 relative">
                <span class="px-2.5 py-1 rounded bg-tertiary-container/10 text-tertiary text-xs font-medium mr-2">${r.subject}</span>
                <button class="preview-resource-btn w-8 h-8 rounded-full hover:bg-surface-variant flex items-center justify-center text-outline transition-colors" data-url="${r.fileUrl}" data-title="${r.title}" title="Preview Resource">
                  <span class="material-symbols-outlined text-sm">visibility</span>
                </button>
                <a href="${r.fileUrl}" target="_blank" class="w-8 h-8 rounded-full hover:bg-surface-variant flex items-center justify-center text-outline transition-colors" title="Download Resource">
                  <span class="material-symbols-outlined text-sm">download</span>
                </a>
                <button data-delete-id="${r._id}" class="delete-resource-btn w-8 h-8 rounded-full hover:bg-error-container/50 flex items-center justify-center text-error transition-colors" title="Delete Resource">
                  <span class="material-symbols-outlined text-sm">delete</span>
                </button>
              </div>
            </article>
          `).join('');

          // Add preview listeners
          document.querySelectorAll('.preview-resource-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              const url = (btn as HTMLElement).getAttribute('data-url');
              const title = (btn as HTMLElement).getAttribute('data-title');
              if (url && title) openPreviewModal(url, title);
            });
          });

          // Add delete listeners
          document.querySelectorAll('.delete-resource-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
              e.stopPropagation(); // prevent article click if any
              const id = (btn as HTMLElement).getAttribute('data-delete-id');
              if (!id) return;

              // Build Custom Modal
              const modalOverlay = document.createElement('div');
              modalOverlay.className = "fixed inset-0 z-[100] flex items-center justify-center bg-on-surface/40 backdrop-blur-sm p-4 duration-200 transition-opacity opacity-0";
              modalOverlay.innerHTML = `
                <div class="bg-surface-container-lowest w-full max-w-sm rounded-[1.25rem] p-6 shadow-xl border border-outline-variant/20 transform scale-95 transition-all duration-200 show-modal-content">
                  <div class="w-12 h-12 rounded-full bg-error-container text-on-error-container flex items-center justify-center mb-4">
                    <span class="material-symbols-outlined">warning</span>
                  </div>
                  <h3 class="font-headline text-xl font-bold text-on-background mb-2">Delete Resource?</h3>
                  <p class="font-body text-sm text-on-surface-variant mb-6">This action cannot be undone. This document will be permanently removed from your archives and the collective library.</p>
                  
                  <!-- Error message display -->
                  <div id="modal-error-text" class="hidden text-error font-body text-xs bg-error-container p-3 rounded-lg mb-4"></div>

                  <div class="flex items-center justify-end gap-3">
                    <button id="cancel-delete-btn" class="px-4 py-2 rounded-full font-label text-sm font-semibold text-on-surface-variant hover:bg-surface-variant transition-colors">Cancel</button>
                    <button id="confirm-delete-btn" class="flex items-center justify-center px-4 py-2 rounded-full font-label text-sm font-bold bg-error text-on-error hover:opacity-90 active:scale-95 transition-all outline-none min-w-[80px]">Delete</button>
                  </div>
                </div>
              `;
              
              document.body.appendChild(modalOverlay);

              // Trigger CSS entry animations
              setTimeout(() => {
                 modalOverlay.classList.remove('opacity-0');
                 const content = modalOverlay.querySelector('.show-modal-content');
                 if(content) {
                   content.classList.remove('scale-95');
                   content.classList.add('scale-100');
                 }
              }, 10);

              const closeModal = () => {
                modalOverlay.classList.add('opacity-0');
                const content = modalOverlay.querySelector('.show-modal-content');
                if(content) {
                  content.classList.remove('scale-100');
                  content.classList.add('scale-95');
                }
                setTimeout(() => modalOverlay.remove(), 200);
              };

              document.getElementById('cancel-delete-btn')?.addEventListener('click', closeModal);
              modalOverlay.addEventListener('click', (ev) => {
                if (ev.target === modalOverlay) closeModal();
              });

              const confirmBtn = document.getElementById('confirm-delete-btn') as HTMLButtonElement;
              confirmBtn?.addEventListener('click', async () => {
                confirmBtn.innerHTML = `<span class="material-symbols-outlined text-sm animate-spin">refresh</span>`;
                confirmBtn.disabled = true;
                const errText = document.getElementById('modal-error-text');
                if (errText) errText.classList.add('hidden');

                try {
                  const res = await fetch(`/api/resources/${id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                  });
                  if (res.ok) {
                    closeModal();
                    render(); // Refresh the archives
                  } else {
                    const errData = await res.json();
                    if (errText) {
                       errText.textContent = errData.message || 'Failed to delete resource.';
                       errText.classList.remove('hidden');
                    }
                    confirmBtn.textContent = 'Delete';
                    confirmBtn.disabled = false;
                  }
                } catch (err) {
                  console.error(err);
                  if (errText) {
                       errText.textContent = 'An error occurred. Please try again.';
                       errText.classList.remove('hidden');
                  }
                  confirmBtn.textContent = 'Delete';
                  confirmBtn.disabled = false;
                }
              });
            });
          });
        }
      })
      .catch(e => {
        archivesList.innerHTML = `<p class="text-error font-body">Failed to load personal archives.</p>`;
      });
    };

    fetchArchives();

    // Attach Search Listener
    if (searchInput && !searchInput.hasAttribute('data-listener-attached')) {
      searchInput.setAttribute('data-listener-attached', 'true');
      let searchTimeout: any;
      searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          fetchArchives(searchInput.value.trim());
        }, 300);
      });
    }
  }

  // Define data fetcher for saved resources
  if (path === '/saved' && isLoggedIn) {
    const savedList = document.getElementById('saved-list');
    
    // We don't have search implemented efficiently for saved on backend, so we'll do client-side filtering if needed, 
    // but a basic search input might exist in nav. Let's assume no search or basic fetch for now.
    const fetchSaved = () => {
      if (!savedList) return;
      
      fetch('/api/resources/saved', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if(data.length === 0) {
          savedList.innerHTML = `<p class="font-body text-on-surface-variant p-6 bg-surface-container-lowest rounded-xl border border-outline-variant/10">You haven't saved any resources yet.</p>`;
        } else {
          savedList.innerHTML = data.map((r: any) => `
            <article class="group bg-surface-container-lowest rounded-xl p-5 hover:bg-surface-container-low transition-colors duration-200 cursor-pointer flex flex-col sm:flex-row sm:items-center gap-5 relative border border-outline-variant/10">
              <div class="w-12 h-12 rounded-lg bg-primary-fixed flex-shrink-0 flex items-center justify-center text-on-primary-fixed">
                <span class="material-symbols-outlined">description</span>
              </div>
              <div class="flex-1">
                <h4 class="font-headline text-lg font-bold text-primary mb-1 group-hover:text-primary-container transition-colors">${r.title}</h4>
                <div class="flex flex-wrap items-center gap-3 text-xs font-label text-on-surface-variant">
                  <span class="flex items-center"><span class="material-symbols-outlined text-[14px] mr-1">person</span> ${r.uploader ? r.uploader.fullName : 'Unknown'}</span>
                  <span>•</span>
                  <span>Added ${new Date(r.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div class="flex items-center gap-2 mt-4 sm:mt-0 z-10 relative">
                <span class="px-2.5 py-1 rounded bg-tertiary-container/10 text-tertiary text-xs font-medium mr-2">${r.subject}</span>
                <button class="preview-resource-btn w-8 h-8 rounded-full hover:bg-surface-variant flex items-center justify-center text-outline transition-colors" data-url="${r.fileUrl}" data-title="${r.title}" title="Preview Resource">
                  <span class="material-symbols-outlined text-sm">visibility</span>
                </button>
                <a href="${r.fileUrl}" target="_blank" class="w-8 h-8 rounded-full hover:bg-surface-variant flex items-center justify-center text-outline transition-colors" title="Download Resource">
                  <span class="material-symbols-outlined text-sm">download</span>
                </a>
                <button class="toggle-save-btn w-8 h-8 rounded-full flex items-center justify-center transition-colors text-primary bg-primary-container hover:bg-primary-container/80" data-id="${r._id}" title="Remove from Bookmarks">
                  <span class="material-symbols-outlined text-sm fill-icon">bookmark</span>
                </button>
              </div>
            </article>
          `).join('');

          // Re-attach preview and download listeners
          const newPreviewBtns = savedList.querySelectorAll('.preview-resource-btn');
          newPreviewBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
               e.stopPropagation();
               const parentDataset = (btn as HTMLElement).dataset;
               const url = parentDataset.url || '';
               const title = parentDataset.title || 'Resource';
               openPreviewModal(url, title);
            });
          });

          // Un-save button logic
          const saveBtns = savedList.querySelectorAll('.toggle-save-btn');
          saveBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
              e.stopPropagation();
              const resourceId = (btn as HTMLElement).dataset.id;
              if (resourceId) {
                try {
                  // Instantly remove from UI to feel snappy 
                  const article = btn.closest('article');
                  if (article) {
                     article.style.opacity = '0.5';
                     article.style.pointerEvents = 'none';
                  }

                  const res = await fetch(`/api/resources/${resourceId}/save`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                  });
                  if (res.ok) {
                    const data = await res.json();
                    localStorage.setItem('peerlearn_user', JSON.stringify(data.user));
                    if (article) article.remove();
                    
                    // If no items left, show empty state
                    if (savedList.children.length === 0) {
                      savedList.innerHTML = `<p class="font-body text-on-surface-variant p-6 bg-surface-container-lowest rounded-xl border border-outline-variant/10">You haven't saved any resources yet.</p>`;
                    }
                  } else {
                     if (article) { // Revert if failed
                        article.style.opacity = '1';
                        article.style.pointerEvents = 'auto';
                     }
                  }
                } catch (err) {
                  console.error("Failed to toggle save", err);
                  const article = btn.closest('article');
                  if (article) {
                     article.style.opacity = '1';
                     article.style.pointerEvents = 'auto';
                  }
                }
              }
            });
          });
        }
      })
      .catch(e => {
        savedList.innerHTML = `<p class="text-error font-body">Failed to load saved resources.</p>`;
      });
    };

    fetchSaved();
  }


  // Settings Logic
  if (path === '/settings' && isLoggedIn) {
    // Proactively sync user data from server to avoid stale localStorage issues
    fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => {
      if (data && data.fullName) {
        // Update local storage
        const currentLocalUser = JSON.parse(localStorage.getItem('peerlearn_user') || '{}');
        const updatedUser = { ...currentLocalUser, ...data };
        localStorage.setItem('peerlearn_user', JSON.stringify(updatedUser));
        
        // If we just loaded and the form exists, check if it needs populating if it was empty
        const offeredInput = document.getElementById('settings-skills-offered') as HTMLInputElement;
        const soughtInput = document.getElementById('settings-skills-sought') as HTMLInputElement;
        
        if (offeredInput && !offeredInput.value && data.skillsOffered && data.skillsOffered.length > 0) {
           offeredInput.value = data.skillsOffered.join(', ');
        }
        if (soughtInput && !soughtInput.value && data.skillsSought && data.skillsSought.length > 0) {
           soughtInput.value = data.skillsSought.join(', ');
        }
      }
    }).catch(console.error);

    const profileForm = document.getElementById('settings-profile-form');
    if (profileForm) {
      profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newName = (document.getElementById('settings-name') as HTMLInputElement).value;
        const rawSkillsOffered = (document.getElementById('settings-skills-offered') as HTMLInputElement).value;
        const rawSkillsSought = (document.getElementById('settings-skills-sought') as HTMLInputElement).value;
        
        const skillsOffered = rawSkillsOffered.split(',').map(s => s.trim()).filter(Boolean);
        const skillsSought = rawSkillsSought.split(',').map(s => s.trim()).filter(Boolean);

        const errDiv = document.getElementById('settings-profile-error');
        const sucDiv = document.getElementById('settings-profile-success');
        const btn = document.getElementById('settings-profile-btn') as HTMLButtonElement;

        if(errDiv) errDiv.classList.add('hidden');
        if(sucDiv) sucDiv.classList.add('hidden');
        
        btn.disabled = true;
        btn.innerText = 'Saving...';

        try {
          const res = await fetch('/api/auth/me', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ fullName: newName, skillsOffered, skillsSought })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.message || 'Failed to update profile');
          
          // Update local storage user data
          localStorage.setItem('peerlearn_user', JSON.stringify(data));
          if(sucDiv) sucDiv.classList.remove('hidden');

          // re-render to update names in sidebars/headers
          setTimeout(render, 1500); 
        } catch(err: any) {
          if (errDiv) {
            errDiv.querySelector('.error-msg')!.textContent = err.message;
            errDiv.classList.remove('hidden');
          }
        } finally {
          btn.disabled = false;
          btn.innerText = 'Save Changes';
        }
      });
    }

    const themeToggle = document.getElementById('theme-toggle-btn');
    if (themeToggle) {
      themeToggle.addEventListener('click', () => {
        const html = document.documentElement;
        if (html.classList.contains('dark')) {
          html.classList.remove('dark');
          localStorage.setItem('theme', 'light');
        } else {
          html.classList.add('dark');
          localStorage.setItem('theme', 'dark');
        }
        render(); // re-render to update the toggle visual state
      });
    }

    const blockedListContainer = document.getElementById('blocked-users-list');
    if (blockedListContainer && isLoggedIn) {
      const fetchBlockedUsers = async () => {
        try {
          const res = await fetch('/api/users/blocked', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.message || 'Failed to fetch blocked users');

          if (data.length === 0) {
            blockedListContainer.innerHTML = `
              <div class="py-6 text-center">
                <div class="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center mx-auto mb-3 opacity-40">
                  <span class="material-symbols-outlined text-outline">verified_user</span>
                </div>
                <p class="font-body text-sm text-on-surface-variant italic">Your blacklist is empty. Good vibes only!</p>
              </div>
            `;
            return;
          }

          blockedListContainer.innerHTML = data.map((u: any) => `
            <div class="flex items-center justify-between p-4 bg-surface-container-low rounded-xl border border-outline-variant/5">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-surface-variant flex items-center justify-center text-on-surface-variant font-bold text-xs uppercase">
                  ${u.fullName.charAt(0)}
                </div>
                <div>
                   <h4 class="font-headline font-semibold text-sm text-on-surface">${u.fullName}</h4>
                   <p class="font-body text-[10px] text-on-surface-variant capitalize">${u.interest || 'Peer'}</p>
                </div>
              </div>
              <button class="unblock-btn px-4 py-1.5 rounded-lg border border-outline-variant hover:bg-surface-container-high text-xs font-label font-bold text-primary transition-all active:scale-95" data-id="${u._id}">
                Unblock
              </button>
            </div>
          `).join('');

          // Bind Unblock Logic
          document.querySelectorAll('.unblock-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
              const target = e.currentTarget as HTMLButtonElement;
              const uid = target.getAttribute('data-id');
              target.disabled = true;
              target.classList.add('opacity-50');

              try {
                const res = await fetch(`/api/users/unblock/${uid}`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                  fetchBlockedUsers(); // Refresh
                }
              } catch (err) { console.error(err); }
            });
          });

        } catch (err) {
          console.error(err);
          blockedListContainer.innerHTML = `<p class="font-body text-xs text-error">Failed to load blocked users.</p>`;
        }
      };

      fetchBlockedUsers();
    }

    const deleteAccountBtn = document.getElementById('delete-account-btn');
    if (deleteAccountBtn) {
      deleteAccountBtn.addEventListener('click', () => {
        // Build Custom Modal
        const modalOverlay = document.createElement('div');
        modalOverlay.className = "fixed inset-0 z-[100] flex items-center justify-center bg-on-surface/40 backdrop-blur-sm p-4 duration-200 transition-opacity opacity-0";
        modalOverlay.innerHTML = `
          <div class="bg-surface-container-lowest w-full max-w-sm rounded-[1.25rem] p-6 shadow-xl border border-error/30 transform scale-95 transition-all duration-200 show-modal-content">
            <div class="w-12 h-12 rounded-full bg-error text-on-error flex items-center justify-center mb-4 shadow-[0_0_15px_rgba(186,26,26,0.3)]">
              <span class="material-symbols-outlined">delete_forever</span>
            </div>
            <h3 class="font-headline text-xl font-bold text-error mb-2">Delete Account?</h3>
            <p class="font-body text-sm text-on-surface-variant mb-6">This action cannot be undone. All your details and uploaded resources will be permanently removed.</p>
            
            <div id="account-modal-error-text" class="hidden text-error font-body text-xs bg-error-container p-3 rounded-lg mb-4"></div>

            <div class="flex items-center justify-end gap-3">
              <button id="cancel-account-delete-btn" class="px-4 py-2 rounded-full font-label text-sm font-semibold text-on-surface-variant hover:bg-surface-variant transition-colors">Cancel</button>
              <button id="confirm-account-delete-btn" class="flex items-center justify-center px-4 py-2 rounded-full font-label text-sm font-bold bg-error text-on-error hover:opacity-90 active:scale-95 transition-all outline-none min-w-[120px]">Yes, Delete</button>
            </div>
          </div>
        `;
        
        document.body.appendChild(modalOverlay);

        setTimeout(() => {
           modalOverlay.classList.remove('opacity-0');
           const content = modalOverlay.querySelector('.show-modal-content');
           if(content) {
             content.classList.remove('scale-95');
             content.classList.add('scale-100');
           }
        }, 10);

        const closeModal = () => {
          modalOverlay.classList.add('opacity-0');
          const content = modalOverlay.querySelector('.show-modal-content');
          if(content) {
            content.classList.remove('scale-100');
            content.classList.add('scale-95');
          }
          setTimeout(() => modalOverlay.remove(), 200);
        };

        document.getElementById('cancel-account-delete-btn')?.addEventListener('click', closeModal);

        const confirmBtn = document.getElementById('confirm-account-delete-btn') as HTMLButtonElement;
        confirmBtn?.addEventListener('click', async () => {
          confirmBtn.innerHTML = `<span class="material-symbols-outlined text-sm animate-spin">refresh</span>`;
          confirmBtn.disabled = true;
          const errText = document.getElementById('account-modal-error-text');
          if (errText) errText.classList.add('hidden');

          try {
            const res = await fetch('/api/auth/me', {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
              closeModal();
              localStorage.removeItem('peerlearn_token');
              localStorage.removeItem('peerlearn_user');
              window.history.pushState({}, '', '/');
              render(); 
            } else {
              const errData = await res.json();
              if (errText) {
                 errText.textContent = errData.message || 'Failed to delete account.';
                 errText.classList.remove('hidden');
              }
              confirmBtn.textContent = 'Yes, Delete';
              confirmBtn.disabled = false;
            }
          } catch (err) {
            console.error(err);
            if (errText) {
                 errText.textContent = 'An error occurred. Please try again.';
                 errText.classList.remove('hidden');
            }
            confirmBtn.textContent = 'Yes, Delete';
            confirmBtn.disabled = false;
          }
        });
      });
    }
  }

  // Discussion Logic
  if (path === '/discussion' && isLoggedIn) {
    let allQuestions: any[] = [];
    let currentTab = 'all'; // all | my | unanswered
    let searchTimeout: any = null;

    const fetchQuestions = async () => {
      const searchTerm = (document.getElementById('discussion-search-input') as HTMLInputElement)?.value || '';
      const params = new URLSearchParams();
      if (currentTab !== 'all') params.append('tab', currentTab);
      if (searchTerm) params.append('search', searchTerm);

      try {
        const res = await fetch(`/api/questions?${params.toString()}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if(res.ok) {
          allQuestions = await res.json();
          renderQuestionsList();
        } else {
          document.getElementById('discussion-list')!.innerHTML = '<p class="text-error font-body p-6">Failed to load questions.</p>';
        }
      } catch (err) {
        document.getElementById('discussion-list')!.innerHTML = '<p class="text-error font-body p-6">Failed to load questions.</p>';
      }
    };

    const renderQuestionsList = () => {
      const listDiv = document.getElementById('discussion-list');
      if (!listDiv) return;

      if (allQuestions.length === 0) {
        listDiv.innerHTML = `
          <div class="flex-1 flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-outline-variant/30 rounded-2xl bg-surface-container-lowest/50">
             <div class="w-16 h-16 rounded-full bg-primary-container/20 flex items-center justify-center text-primary mb-4">
                <span class="material-symbols-outlined text-3xl">forum</span>
             </div>
             <h3 class="font-headline text-xl font-bold text-on-surface mb-2">No discussions found</h3>
             <p class="font-body text-on-surface-variant max-w-sm mb-6">Be the first to start a conversation! Ask a question or share a thought.</p>
             <button class="text-primary font-label font-bold text-sm bg-primary-container/10 px-6 py-2.5 rounded-full hover:bg-primary-container/20 transition-colors" onclick="document.getElementById('open-ask-modal-btn')?.click()">Start a Discussion</button>
          </div>
        `;
        return;
      }

      listDiv.innerHTML = allQuestions.map(q => `
        <article class="bg-surface-container-lowest rounded-xl p-5 hover:bg-surface-container-low transition-colors duration-200 cursor-pointer flex gap-4 relative border border-outline-variant/10 shadow-sm" onclick="window.history.pushState({}, '', '/discussion/${q._id}'); window.dispatchEvent(new Event('popstate'));">
          <!-- Voting Side -->
          <div class="flex flex-col items-center pt-1 shrink-0">
             <span class="material-symbols-outlined text-outline-variant text-[20px]">expand_less</span>
             <span class="font-headline font-bold text-sm my-0.5 text-on-surface ${(q.upvotes - (q.downvotes||0)) > 0 ? 'text-primary' : ((q.upvotes - (q.downvotes||0)) < 0) ? 'text-error' : ''}">${q.upvotes - (q.downvotes || 0)}</span>
             <span class="material-symbols-outlined text-outline-variant text-[20px]">expand_more</span>
          </div>

          <div class="flex flex-col gap-3 flex-1 overflow-hidden">
            <div class="flex items-start justify-between gap-4">
              <h4 class="font-headline text-lg font-bold text-primary flex-1 leading-tight">${q.title}</h4>
              <span class="px-2.5 py-1 rounded-full bg-tertiary-container/10 text-tertiary text-xs font-semibold whitespace-nowrap shrink-0 border border-tertiary/10">${q.subject}</span>
            </div>
            <p class="font-body text-sm text-on-surface-variant line-clamp-2 leading-relaxed">${q.body}</p>
            ${q.imageUrl ? `
              <div class="relative w-24 h-16 rounded-lg overflow-hidden border border-outline-variant/20 mt-1 shadow-sm">
                 <img src="${q.imageUrl}" class="w-full h-full object-cover" />
              </div>
            ` : ''}
            <div class="flex flex-wrap items-center justify-between gap-3 mt-2 border-t border-secondary-container/10 pt-3">
               <div class="flex items-center gap-2 text-xs font-label text-on-surface-variant">
                 <span class="flex items-center"><span class="material-symbols-outlined text-[14px] mr-1.5 opacity-70">person</span> <strong>${q.author?.fullName || 'Unknown'}</strong></span>
                 <span class="opacity-50">•</span>
                 <span>${new Date(q.createdAt).toLocaleDateString()}</span>
               </div>
               <div class="flex items-center gap-4 text-xs font-label text-on-surface-variant font-medium">
                  <span class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px] text-primary">forum</span> ${q.answerCount || 0} Answers</span>
               </div>
            </div>
          </div>
        </article>
      `).join('');
      applyMathJax();
    };

    // Tab Switching
    const tabs = document.querySelectorAll('#discussion-tabs button');
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        tabs.forEach(t => {
          t.className = "px-5 py-2.5 rounded-full border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors font-label text-sm font-semibold whitespace-nowrap";
        });
        const clicked = e.target as HTMLButtonElement;
        clicked.className = "px-5 py-2.5 rounded-full bg-surface-container-high text-on-surface font-label text-sm font-semibold whitespace-nowrap active-tab";
        currentTab = clicked.getAttribute('data-tab') || 'all';
        fetchQuestions(); // Refetch from backend instead of local filter
      });
    });

    // Search Input binding (Debounced)
    document.getElementById('discussion-search-input')?.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        fetchQuestions();
      }, 300);
    });

    // Initial Fetch
    fetchQuestions();

    // Modal Logic
    const modal = document.getElementById('ask-question-modal');
    const modalContent = document.getElementById('ask-modal-content');
    
    document.getElementById('open-ask-modal-btn')?.addEventListener('click', () => {
      if(modal && modalContent) {
        modal.classList.remove('opacity-0', 'pointer-events-none');
        modalContent.classList.remove('scale-95');
        modalContent.classList.add('scale-100');
      }
    });

    const closeModal = () => {
      if(modal && modalContent) {
        modal.classList.add('opacity-0', 'pointer-events-none');
        modalContent.classList.remove('scale-100');
        modalContent.classList.add('scale-95');
      }
    };
    
    document.getElementById('close-ask-modal-btn')?.addEventListener('click', closeModal);
    document.getElementById('cancel-ask-btn')?.addEventListener('click', closeModal);

    // Image Upload Preview Logic
    const dropzone = document.getElementById('ask-image-dropzone');
    const fileInput = document.getElementById('ask-image-input') as HTMLInputElement;
    const previewContainer = document.getElementById('ask-image-preview-container');
    const previewImage = document.getElementById('ask-image-preview') as HTMLImageElement;
    const promptArea = document.getElementById('ask-image-prompt');
    const removeImageBtn = document.getElementById('ask-image-remove');
    let currentFile: File | null = null;

    fileInput?.addEventListener('change', (e) => {
      if (fileInput.files && fileInput.files.length > 0) {
        currentFile = fileInput.files[0];
        const objUrl = URL.createObjectURL(currentFile);
        previewImage.src = objUrl;
        promptArea?.classList.add('hidden');
        previewContainer?.classList.remove('hidden');
        previewContainer?.classList.add('flex');
      }
    });

    removeImageBtn?.addEventListener('click', (e) => {
      e.stopPropagation(); // prevent clicking dropzone
      currentFile = null;
      fileInput.value = '';
      previewImage.src = '';
      promptArea?.classList.remove('hidden');
      previewContainer?.classList.add('hidden');
      previewContainer?.classList.remove('flex');
    });

    // Handle Form Submission
    const askForm = document.getElementById('ask-question-form');
    askForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const title = (document.getElementById('ask-title') as HTMLInputElement).value;
      const subject = (document.getElementById('ask-subject') as HTMLInputElement).value;
      const body = (document.getElementById('ask-body') as HTMLTextAreaElement).value;
      const errorMsg = document.getElementById('ask-error-msg');
      const submitBtn = document.getElementById('submit-ask-btn') as HTMLButtonElement;

      if(errorMsg) errorMsg.classList.add('hidden');
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span class="material-symbols-outlined text-[20px] animate-spin">refresh</span> Posting...`;

      try {
        const formData = new FormData();
        formData.append('title', title);
        formData.append('subject', subject);
        formData.append('body', body);
        if (currentFile) formData.append('image', currentFile);

        const res = await fetch('/api/questions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to post question');

        // Success - clean everything up and prepend to list
        closeModal();
        (askForm as HTMLFormElement).reset();
        removeImageBtn?.click();
        
        allQuestions.unshift(data); // Add new question directly to state
        renderQuestionsList();      // refresh view
        
      } catch (err: any) {
        if(errorMsg) {
          errorMsg.innerHTML = `<span class="material-symbols-outlined text-sm">error</span> <span>${err.message}</span>`;
          errorMsg.classList.remove('hidden');
        }
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `Post Question`;
      }
    });
  }

  // Discussion Detail Logic
  if (path.startsWith('/discussion/') && isLoggedIn) {
    const questionId = path.split('/')[2];
    const container = document.getElementById('question-detail-container');
    
    if (container && questionId) {
       const fetchQuestionDetails = async () => {
          try {
             // Fetch question and answers
             const res = await fetch(`/api/questions/${questionId}`, {
               headers: { 'Authorization': `Bearer ${token}` }
             });
             
             if (!res.ok) throw new Error('Failed to fetch details');
             const data = await res.json();
             const q = data.question;
             const answers = data.answers;

             container.innerHTML = `
                <!-- Main Question -->
                <article class="bg-surface-container-lowest rounded-[2rem] p-6 md:p-8 border border-outline-variant/20 shadow-md flex gap-4 md:gap-6 relative">
                   
                   <!-- Voting Column -->
                   <div class="flex flex-col items-center shrink-0">
                      <button class="vote-btn p-1.5 rounded-full hover:bg-surface-variant text-on-surface-variant transition-colors ${q.upvotedBy?.includes(user.id) ? 'text-primary' : ''}" data-type="q" data-action="up" data-id="${q._id}">
                         <span class="material-symbols-outlined ${q.upvotedBy?.includes(user.id) ? 'fill-icon' : ''}">shift</span>
                      </button>
                      <span class="font-headline font-bold text-lg my-1 text-on-surface">${q.upvotes - (q.downvotes || 0)}</span>
                      <button class="vote-btn p-1.5 rounded-full hover:bg-surface-variant text-on-surface-variant transition-colors ${q.downvotedBy?.includes(user.id) ? 'text-error' : ''}" data-type="q" data-action="down" data-id="${q._id}">
                         <span class="material-symbols-outlined rotate-180 ${q.downvotedBy?.includes(user.id) ? 'fill-icon' : ''}">shift</span>
                      </button>
                   </div>

                   <div class="flex-1 w-full overflow-hidden">
                     <div class="flex items-center gap-3 mb-6">
                        <div class="w-10 h-10 rounded-full bg-primary-container text-primary flex items-center justify-center font-bold text-lg uppercase">${q.author?.fullName.charAt(0) || 'U'}</div>
                        <div>
                           <p class="font-label font-bold text-on-surface leading-tight">${q.author?.fullName || 'Unknown User'}</p>
                           <p class="font-body text-xs text-on-surface-variant">${new Date(q.createdAt).toLocaleDateString()}</p>
                        </div>
                        <span class="ml-auto px-3 py-1 rounded-full bg-tertiary-container/20 text-tertiary text-sm font-semibold border border-tertiary/10 hidden sm:inline-flex">${q.subject}</span>
                     </div>
                     
                     <h1 class="font-headline text-2xl md:text-3xl font-extrabold text-on-background tracking-tight mb-4">${q.title}</h1>
                     <p class="font-body text-base md:text-lg text-on-surface whitespace-pre-wrap leading-relaxed">${q.body}</p>
                     
                     ${q.imageUrl ? `
                        <div class="mt-6 rounded-xl overflow-hidden border border-outline-variant/30 w-full max-w-2xl bg-surface-container-lowest flex items-center justify-center">
                           <img src="${q.imageUrl}" class="max-w-full max-h-[400px] object-contain cursor-pointer hover:opacity-90 transition-opacity preview-q-media" data-url="${q.imageUrl}" data-title="Question Image" title="Click to Preview" />
                        </div>
                     ` : ''}
                     
                     <div class="mt-8 pt-6 border-t border-outline-variant/10 flex items-center justify-between text-on-surface-variant font-label text-sm">
                        <span class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[18px]">forum</span> ${answers.length} Answers</span>
                        <div class="flex items-center gap-2">
                           <span class="sm:hidden px-3 py-1 rounded-full bg-tertiary-container/20 text-tertiary text-xs font-semibold border border-tertiary/10">${q.subject}</span>
                        </div>
                     </div>
                   </div>
                </article>

                <!-- Answers Section -->
                <div>
                  <h3 class="font-headline text-2xl font-bold text-on-surface mb-6 ml-2">Answers</h3>
                  
                  <div class="space-y-4 mb-10">
                     ${answers.length === 0 ? `
                        <div class="text-center py-10 bg-surface-container-lowest/50 rounded-xl border border-dashed border-outline-variant/30">
                           <p class="font-body text-on-surface-variant">No answers yet. Share your knowledge!</p>
                        </div>
                     ` : answers.map((a: any) => `
                        <div class="bg-surface-container-lowest rounded-xl p-6 border ${a.isAccepted ? 'border-success/50 bg-success/5 shadow-md shadow-success/10' : 'border-outline-variant/20 shadow-sm'} relative overflow-hidden flex gap-4 md:gap-5">
                           ${a.isAccepted ? '<div class="absolute top-0 right-0 py-1.5 px-3 bg-success text-on-success text-xs font-bold font-label rounded-bl-lg shadow-sm flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">verified</span> Verified Solution</div>' : ''}
                           ${!a.isAccepted && (q.author?._id === user.id || q.author === user.id) ? `
                             <button class="accept-answer-btn absolute top-3 right-3 text-success hover:bg-success/10 px-3 py-1.5 rounded-full flex items-center gap-1 transition-colors text-xs font-bold font-label border border-success/30" data-answer-id="${a._id}">
                               <span class="material-symbols-outlined text-[16px]">check_circle</span> Mark as Verified
                             </button>
                           ` : ''}
                           
                           <!-- Answer Voting Column -->
                           <div class="flex flex-col items-center shrink-0">
                              <button class="vote-btn p-1.5 rounded-full hover:bg-surface-variant text-on-surface-variant transition-colors ${a.upvotedBy?.includes(user.id) ? 'text-primary' : ''}" data-type="a" data-action="up" data-id="${a._id}">
                                 <span class="material-symbols-outlined ${a.upvotedBy?.includes(user.id) ? 'fill-icon' : ''}">shift</span>
                              </button>
                              <span class="font-headline font-bold text-md my-1 text-on-surface">${a.upvotes - (a.downvotes || 0)}</span>
                              <button class="vote-btn p-1.5 rounded-full hover:bg-surface-variant text-on-surface-variant transition-colors ${a.downvotedBy?.includes(user.id) ? 'text-error' : ''}" data-type="a" data-action="down" data-id="${a._id}">
                                 <span class="material-symbols-outlined rotate-180 ${a.downvotedBy?.includes(user.id) ? 'fill-icon' : ''}">shift</span>
                              </button>
                           </div>

                           <div class="flex-1 w-full overflow-hidden">
                              <div class="flex items-start justify-between mb-4">
                                 <div class="flex items-center gap-3">
                                    <div class="w-8 h-8 rounded-full bg-secondary-container text-secondary flex items-center justify-center font-bold text-sm uppercase">${a.author?.fullName.charAt(0) || 'U'}</div>
                                    <div>
                                       <p class="font-label font-bold text-on-surface leading-tight text-sm">${a.author?.fullName || 'Unknown User'}</p>
                                       <p class="font-body text-xs text-on-surface-variant">${new Date(a.createdAt).toLocaleDateString()}</p>
                                    </div>
                                 </div>
                                 ${''}
                              </div>
                              <p class="font-body text-on-surface whitespace-pre-wrap">${a.body}</p>
                              ${a.imageUrl ? `
                                 <div class="mt-4 rounded-xl overflow-hidden border border-outline-variant/20 w-fit max-w-sm bg-surface-container-lowest">
                                    <img src="${a.imageUrl}" class="w-full object-contain cursor-pointer hover:opacity-90 transition-opacity preview-q-media" data-url="${a.imageUrl}" data-title="Answer Image" title="Click to Preview" />
                                 </div>
                              ` : ''}
                              ${a.fileUrl ? `
                                 <div class="mt-4 flex items-center gap-2">
                                   <button class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-outline-variant/30 bg-surface-container-lowest hover:bg-surface-container-low transition-colors text-primary font-label text-sm font-semibold preview-q-media" data-url="${a.fileUrl}" data-title="${a.fileName || 'Attachment'}">
                                     <span class="material-symbols-outlined text-[18px]">visibility</span>
                                     Preview ${a.fileName || 'Attachment'}
                                   </button>
                                   <a href="${a.fileUrl}" target="_blank" class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface-container-lowest hover:bg-surface-container-low transition-colors text-outline font-label text-sm font-semibold" title="Download directly">
                                     <span class="material-symbols-outlined text-[18px]">download</span>
                                   </a>
                                 </div>
                              ` : ''}
                           </div>
                        </div>
                     `).join('')}
                  </div>

                  <!-- Post Answer Box -->
                  <div class="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/20 shadow-inner mt-8 relative">
                     <h4 class="font-headline font-bold text-primary mb-4">Your Answer</h4>
                     <form id="post-answer-form" class="space-y-4">
                        <div id="answer-error-msg" class="hidden text-error font-body text-sm bg-error-container p-3 rounded-lg flex items-center gap-2"></div>
                        <textarea id="answer-body" required rows="4" placeholder="Write your answer..." class="w-full bg-surface-container-lowest border border-outline-variant/50 rounded-xl py-3 px-4 text-sm font-body text-on-surface focus:border-primary focus:ring-1 focus:ring-primary transition-shadow placeholder:text-outline-variant resize-y"></textarea>
                        
                        <!-- File Upload for Answer -->
                        <div class="relative">
                           <input type="file" id="answer-file-input" class="hidden" />
                           <button type="button" id="answer-file-trigger" class="font-label text-sm font-semibold flex items-center gap-2 text-primary hover:bg-primary-container/20 px-4 py-2 rounded-lg transition-colors border border-primary/20">
                             <span class="material-symbols-outlined text-[18px]">attach_file</span> Attach File/Image
                           </button>
                           <div id="answer-file-preview-container" class="hidden mt-3 max-h-24 relative w-fit">
                             <div id="answer-file-preview" class="px-4 py-3 rounded-lg border border-outline-variant/30 bg-surface-container-lowest flex items-center gap-3">
                                <span class="material-symbols-outlined text-primary text-xl">docs</span>
                                <span class="text-sm font-body font-medium text-on-surface w-32 truncate" id="answer-file-name">filename.pdf</span>
                             </div>
                             <button type="button" id="answer-file-remove" class="absolute -top-2 -right-2 bg-error text-on-error w-6 h-6 rounded-full flex items-center justify-center hover:scale-110 shadow-md">
                               <span class="material-symbols-outlined text-[14px]">close</span>
                             </button>
                           </div>
                        </div>

                        <div class="flex justify-end pt-2">
                           <button type="submit" id="submit-answer-btn" class="px-6 py-2.5 rounded-full font-label text-sm font-bold bg-primary text-on-primary hover:scale-[1.02] active:scale-95 transition-all shadow-sm shadow-primary/20 flex items-center gap-2">
                              Post Answer
                           </button>
                        </div>
                     </form>
                  </div>
                </div>
             `;

             // Bind UI for answer file
             const ansFileInput = document.getElementById('answer-file-input') as HTMLInputElement;
             const ansTrigger = document.getElementById('answer-file-trigger');
             const ansPreviewContainer = document.getElementById('answer-file-preview-container');
             const ansFileName = document.getElementById('answer-file-name');
             const ansRemoveBtn = document.getElementById('answer-file-remove');
             let ansCurrentFile: File | null = null;

             ansTrigger?.addEventListener('click', () => ansFileInput?.click());
             
             ansFileInput?.addEventListener('change', () => {
                if (ansFileInput.files && ansFileInput.files.length > 0) {
                  ansCurrentFile = ansFileInput.files[0];
                  if(ansFileName) ansFileName.textContent = ansCurrentFile.name;
                  ansPreviewContainer?.classList.remove('hidden');
                }
             });

             ansRemoveBtn?.addEventListener('click', () => {
                ansCurrentFile = null;
                ansFileInput.value = '';
                if(ansFileName) ansFileName.textContent = '';
                ansPreviewContainer?.classList.add('hidden');
             });

             // Bind Accept
             document.querySelectorAll('.accept-answer-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                   const answerId = btn.getAttribute('data-answer-id');
                   if(!answerId) return;
                   
                   try {
                     await fetch(`/api/questions/${questionId}/answers/${answerId}/accept`, {
                       method: 'PUT',
                       headers: { 'Authorization': `Bearer ${token}` }
                     });
                     fetchQuestionDetails();
                   } catch(e) {
                     console.error("Accepting answer failed", e);
                   }
                });
             });

             // Bind Media Previews
             document.querySelectorAll('.preview-q-media').forEach(el => {
                el.addEventListener('click', (e) => {
                   const url = el.getAttribute('data-url');
                   const title = el.getAttribute('data-title') || 'Media Preview';
                   if(url) openPreviewModal(url, title);
                });
             });

             // Bind Voting
             document.querySelectorAll('.vote-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                   const type = btn.getAttribute('data-type'); // 'q' or 'a'
                   const action = btn.getAttribute('data-action');
                   const id = btn.getAttribute('data-id');
                   if(!type || !action || !id) return;
                   
                   try {
                     let url = '';
                     if (type === 'q') url = `/api/questions/${questionId}/vote`;
                     else url = `/api/questions/${questionId}/answers/${id}/vote`;
                     
                     await fetch(url, {
                       method: 'POST',
                       headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                       body: JSON.stringify({ action })
                     });
                     
                     fetchQuestionDetails(); // re-paint cleanly
                   } catch(e) {
                     console.error("Voting failed", e);
                   }
                });
             });

             applyMathJax();

             // Bind Answer Form
             const answerForm = document.getElementById('post-answer-form');
             answerForm?.addEventListener('submit', async (e) => {
                e.preventDefault();
                const bodyStr = (document.getElementById('answer-body') as HTMLTextAreaElement).value;
                const errorMsg = document.getElementById('answer-error-msg');
                const submitBtn = document.getElementById('submit-answer-btn') as HTMLButtonElement;
                
                if(errorMsg) errorMsg.classList.add('hidden');
                submitBtn.disabled = true;
                submitBtn.innerHTML = `<span class="material-symbols-outlined text-[20px] animate-spin">refresh</span> Posting...`;

                try {
                   const formData = new FormData();
                   formData.append('body', bodyStr);
                   if (ansCurrentFile) formData.append('file', ansCurrentFile); // updated key to 'file'

                   const ansRes = await fetch(`/api/questions/${questionId}/answers`, {
                     method: 'POST',
                     headers: { 
                       'Authorization': `Bearer ${token}` 
                     },
                     body: formData
                   });
                   const ansData = await ansRes.json();
                   if(!ansRes.ok) throw new Error(ansData.message || 'Failed to post answer.');
                   
                   // Refetch to cleanly paint the whole page
                   fetchQuestionDetails();
                   
                } catch (err: any) {
                   if(errorMsg) {
                     errorMsg.innerHTML = `<span class="material-symbols-outlined text-sm">error</span> <span>${err.message}</span>`;
                     errorMsg.classList.remove('hidden');
                   }
                } finally {
                   submitBtn.disabled = false;
                   submitBtn.innerHTML = `Post Answer`;
                }
             });

          } catch (err: any) {
             container.innerHTML = `
               <div class="text-center py-20">
                 <span class="material-symbols-outlined text-error text-5xl mb-4">error</span>
                 <p class="font-body text-on-surface-variant font-bold text-lg">${err.message || 'Failed to load discussion'}</p>
                 <a href="/discussion" data-link class="text-primary font-label font-bold mt-4 inline-block hover:underline">Go Back</a>
               </div>
             `;
          }
       };

       fetchQuestionDetails();
    }
  }

  // Matches Page Logic
  if (path === '/matches' && isLoggedIn) {
    const fetchRequests = async () => {
      const section = document.getElementById('requests-section');
      const container = document.getElementById('requests-list');
      if (!section || !container) return;

      try {
        const res = await fetch('/api/users/requests', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const requests = await res.json();
        
        if (requests.length > 0) {
          section.classList.remove('hidden');
          container.innerHTML = requests.map((r: any) => `
            <div class="bg-primary/5 border border-primary/20 rounded-2xl p-6 shadow-sm flex flex-col">
              <div class="flex items-center gap-3 mb-4">
                <div class="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold uppercase">${r.sender.fullName.charAt(0)}</div>
                <div>
                  <h4 class="font-headline font-bold text-on-surface">${r.sender.fullName}</h4>
                  <p class="font-body text-xs text-on-surface-variant">${r.sender.interest || 'Peer Scholar'}</p>
                </div>
              </div>
              <div class="flex gap-2">
                <button class="handle-request-btn flex-1 bg-primary text-on-primary rounded-xl py-2 font-label font-bold text-xs" data-action="accept" data-id="${r.sender._id}">Accept</button>
                <button class="handle-request-btn flex-1 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-xl py-2 font-label font-bold text-xs" data-action="reject" data-id="${r.sender._id}">Decline</button>
              </div>
            </div>
          `).join('');

          document.querySelectorAll('.handle-request-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
               const target = e.currentTarget as HTMLButtonElement;
               const action = target.getAttribute('data-action');
               const senderId = target.getAttribute('data-id');
               
               target.disabled = true;
               try {
                 const res = await fetch(`/api/users/connect/${senderId}`, {
                   method: 'POST',
                   headers: {
                     'Content-Type': 'application/json',
                     'Authorization': `Bearer ${token}`
                   },
                   body: JSON.stringify({ action })
                 });
                 if (res.ok) {
                   fetchRequests();
                   fetchMatches();
                 }
               } catch (err) { console.error(err); }
            });
          });
        } else {
          section.classList.add('hidden');
        }
      } catch (err) { console.error(err); }
    };

    const fetchMatches = async () => {
      const container = document.getElementById('matches-list');
      if (!container) return;
      
      try {
        const res = await fetch('/api/users/matches', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const matches = await res.json();

        if (matches.length === 0) {
          container.innerHTML = `
            <div class="col-span-full py-10 flex flex-col items-center justify-center bg-surface-container-lowest/50 rounded-xl border border-dashed border-outline-variant/30 text-center px-4">
               <span class="material-symbols-outlined text-4xl text-outline mb-2">person_search</span>
               <p class="text-on-surface-variant font-body">No mutual matches found yet.</p>
               <p class="text-on-surface-variant font-body text-sm mt-2 max-w-md">Try adding more skills to your 'Settings' to increase your chances of finding a match.</p>
            </div>
          `;
          return;
        }

        container.innerHTML = matches.map((m: any) => {
          const upvoted = m.upvotedBy?.includes(user.id);
          const downvoted = m.downvotedBy?.includes(user.id);
          
          let actionButton = '';
          if (m.connectionStatus === 'accepted') {
            actionButton = `
              <a href="/chat/${m._id}" data-link class="w-full mt-auto bg-primary text-on-primary rounded-xl py-2.5 flex justify-center items-center gap-2 font-label font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-95">
                <span class="material-symbols-outlined text-[18px]">chat</span> Message
              </a>
            `;
          } else if (m.connectionStatus === 'sent_pending') {
            actionButton = `
              <button disabled class="w-full mt-auto bg-surface-container text-outline rounded-xl py-2.5 flex justify-center items-center gap-2 font-label font-bold text-sm cursor-not-allowed">
                <span class="material-symbols-outlined text-[18px]">hourglass_empty</span> Requested
              </button>
            `;
          } else if (m.connectionStatus === 'received_pending') {
             actionButton = `
              <button class="handle-request-btn w-full mt-auto bg-tertiary text-on-tertiary rounded-xl py-2.5 flex justify-center items-center gap-2 font-label font-bold text-sm hover:shadow-md transition-all active:scale-95" data-action="accept" data-id="${m._id}">
                <span class="material-symbols-outlined text-[18px]">done_all</span> Accept Request
              </button>
            `;
          } else {
            actionButton = `
              <button class="connect-user-btn w-full mt-auto bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-on-surface rounded-xl py-2.5 flex justify-center items-center gap-2 font-label font-bold text-sm transition-colors" data-id="${m._id}">
                <span class="material-symbols-outlined text-[18px]">person_add</span> Connect to Chat
              </button>
            `;
          }

          return `
          <div class="bg-surface-container-lowest border border-outline-variant/20 rounded-2xl p-6 shadow-sm flex flex-col relative overflow-hidden group">
             <div class="flex items-start justify-between mb-4">
                <div class="flex items-center gap-3">
                  <div class="w-12 h-12 rounded-full bg-secondary-container text-secondary flex items-center justify-center font-bold text-lg uppercase shadow-inner relative">
                    ${m.fullName.charAt(0)}
                    <span class="unread-dot-${m._id} hidden absolute -top-1 -right-1 w-4 h-4 bg-error border-2 border-surface rounded-full"></span>
                  </div>
                  <div>
                    <h3 class="font-headline font-bold text-on-surface text-lg">${m.fullName}</h3>
                    <p class="font-body text-xs text-on-surface-variant line-clamp-1">${m.interest || 'Enthusiast'}</p>
                  </div>
                </div>
                
                <!-- Rating System -->
                <div class="flex flex-col items-center shrink-0 ml-2">
                  <button class="vote-user-btn p-1 rounded hover:bg-surface-variant text-on-surface-variant transition-colors ${upvoted ? 'text-primary' : ''}" data-action="up" data-id="${m._id}" title="Upvote this peer">
                     <span class="material-symbols-outlined text-sm ${upvoted ? 'fill-icon' : ''}">thumb_up</span>
                  </button>
                  <span class="font-headline font-bold text-xs my-0.5 text-on-surface user-score-${m._id}">${(m.upvotes || 0) - (m.downvotes || 0)}</span>
                  <button class="vote-user-btn p-1 rounded hover:bg-surface-variant text-on-surface-variant transition-colors ${downvoted ? 'text-error' : ''}" data-action="down" data-id="${m._id}" title="Downvote this peer">
                     <span class="material-symbols-outlined text-sm ${downvoted ? 'fill-icon' : ''}">thumb_down</span>
                  </button>
                </div>
             </div>

             <div class="space-y-3 mb-6 flex-1">
               <div>
                  <p class="font-label text-xs text-on-surface-variant mb-1 font-semibold">They can teach you:</p>
                  <div class="flex flex-wrap gap-1">
                    ${m.skillsOffered.filter((s: string) => user.skillsSought?.includes(s)).map((s: string) => `<span class="bg-primary/10 text-primary px-2 py-0.5 rounded text-[10px] font-bold border border-primary/20">${s}</span>`).join('')}
                    ${m.skillsOffered.filter((s: string) => !user.skillsSought?.includes(s)).map((s: string) => `<span class="bg-surface-variant text-on-surface-variant px-2 py-0.5 rounded text-[10px] font-medium border border-outline-variant/30">${s}</span>`).join('')}
                  </div>
               </div>
               <div>
                  <p class="font-label text-xs text-on-surface-variant mb-1 font-semibold">They want to learn:</p>
                  <div class="flex flex-wrap gap-1">
                    ${m.skillsSought.filter((s: string) => user.skillsOffered?.includes(s)).map((s: string) => `<span class="bg-tertiary/10 text-tertiary px-2 py-0.5 rounded text-[10px] font-bold border border-tertiary/20">${s}</span>`).join('')}
                    ${m.skillsSought.filter((s: string) => !user.skillsOffered?.includes(s)).map((s: string) => `<span class="bg-surface-variant text-on-surface-variant px-2 py-0.5 rounded text-[10px] font-medium border border-outline-variant/30">${s}</span>`).join('')}
                  </div>
               </div>
             </div>

             ${actionButton}
          </div>
          `;
        }).join('');
        
        addRoutingEvents();
        
        // Connect Btn Handler
        document.querySelectorAll('.connect-user-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const target = e.currentTarget as HTMLButtonElement;
            const recipientId = target.getAttribute('data-id');
            target.disabled = true;
            target.innerHTML = `<span class="animate-spin material-symbols-outlined text-sm">refresh</span> Sending...`;

            try {
              const res = await fetch(`/api/users/connect/${recipientId}`, {
                method: 'POST',
                headers: {
                   'Content-Type': 'application/json',
                   'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ action: 'request' })
              });
              if(res.ok) {
                fetchMatches();
              }
            } catch(e) { console.error(e); }
          });
        });

        // Request handling from within matches list (Accepting)
        document.querySelectorAll('.handle-request-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
               const target = e.currentTarget as HTMLButtonElement;
               const action = target.getAttribute('data-action');
               const senderId = target.getAttribute('data-id');
               
               target.disabled = true;
               try {
                 const res = await fetch(`/api/users/connect/${senderId}`, {
                   method: 'POST',
                   headers: {
                     'Content-Type': 'application/json',
                     'Authorization': `Bearer ${token}`
                   },
                   body: JSON.stringify({ action })
                 });
                 if (res.ok) {
                   fetchRequests();
                   fetchMatches();
                 }
               } catch (err) { console.error(err); }
            });
          });

        // Attach vote handlers
        document.querySelectorAll('.vote-user-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const target = e.currentTarget as HTMLButtonElement;
            const action = target.getAttribute('data-action');
            const targetId = target.getAttribute('data-id');
            const scoreSpan = document.querySelector(`.user-score-${targetId}`);
            if (!scoreSpan || !targetId || !action) return;
            
            target.disabled = true;
            try {
               const res = await fetch(`/api/users/${targetId}/vote`, {
                 method: 'POST',
                 headers: {
                   'Content-Type': 'application/json',
                   'Authorization': `Bearer ${token}`
                 },
                 body: JSON.stringify({ action })
               });
               if(res.ok) {
                 const data = await res.json();
                 scoreSpan.textContent = (data.upvotes - data.downvotes).toString();
               }
            } catch(e) {
               console.error(e);
            } finally {
               target.disabled = false;
            }
          });
        });

      } catch (err) {
        console.error(err);
        container.innerHTML = `<p class="text-error col-span-full">Failed to load matches.</p>`;
      }
    };
    fetchRequests();
    fetchMatches();
  }

  // Chat Page Logic
  if (path.startsWith('/chat/') && isLoggedIn) {
    const otherUserId = path.split('/')[2];
    currentChatUserId = otherUserId;
    
    // Connect Socket
    initSocket(user.id);
    
    // Block button
    const blockBtn = document.getElementById('block-user-btn');
    if (blockBtn && !blockBtn.hasAttribute('data-listen')) {
       blockBtn.setAttribute('data-listen', 'true');
       blockBtn.addEventListener('click', () => {
         showConfirm(
           'Block this Peer?', 
           'You will no longer be able to message each other, and all your connection requests will be cancelled permanently.',
           async () => {
             try {
               const res = await fetch(`/api/users/block/${otherUserId}`, {
                 method: 'POST',
                 headers: { 'Authorization': `Bearer ${token}` }
               });
               if (res.ok) {
                 window.history.pushState({}, '', '/matches');
                 render();
               }
             } catch (err) { console.error(err); }
           }
         );
       });
    }

    const form = document.getElementById('chat-form') as HTMLFormElement;
    const input = document.getElementById('chat-input') as HTMLTextAreaElement;
    const messagesContainer = document.getElementById('chat-messages');
    const headerName = document.getElementById('chat-user-name');
    const headerAvatar = document.getElementById('chat-avatar');
    
    // Auto-scroll logic
    const scrollToBottom = () => {
      if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    };

    // Load Chat Partner Info
    fetch(`/api/users/${otherUserId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => {
       if (headerName && data.fullName) headerName.textContent = data.fullName;
       if (headerAvatar && data.fullName) headerAvatar.textContent = data.fullName.charAt(0);
    }).catch(console.error);

    // Initial Load
    fetch(`/api/messages/${otherUserId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(messages => {
      if (!messagesContainer) return;
      messagesContainer.innerHTML = '';
      
      if (messages.length === 0) {
         messagesContainer.innerHTML = `
           <div class="h-full flex flex-col items-center justify-center text-center px-4">
              <div class="w-16 h-16 bg-surface-container-high rounded-full flex items-center justify-center mb-4 text-on-surface-variant">
                <span class="material-symbols-outlined text-3xl">handshake</span>
              </div>
              <h3 class="font-headline font-bold text-lg text-on-surface mb-1">Start the conversation!</h3>
              <p class="font-body text-sm text-on-surface-variant">Introduce yourself and what you'd like to learn or teach.</p>
           </div>
         `;
      } else {
         for (const msg of messages) {
           // We use appendMessage from earlier
           appendMessage(msg, user.id);
         }
      }
    }).catch(console.error);

    // Enter to submit
    if (input && !input.hasAttribute('data-listen')) {
      input.setAttribute('data-listen', 'true');
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          form.dispatchEvent(new Event('submit'));
        }
      });
    }

    // Submit form
    if (form && !form.hasAttribute('data-listen')) {
      form.setAttribute('data-listen', 'true');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        
        input.value = '';
        input.style.height = 'auto'; // reset textarea
        
        try {
          const res = await fetch(`/api/messages/${otherUserId}`, {
            method: 'POST',
            headers: {
               'Content-Type': 'application/json',
               'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ text })
          });
          if(res.ok) {
            // Note: with socket.io we'll receive the message back locally
          }
        } catch(err) {
          console.error(err);
        }
      });
    }

    // Back button routing
    const backBtn = document.getElementById('chat-back');
    if (backBtn && !backBtn.hasAttribute('data-listen')) {
      backBtn.setAttribute('data-listen', 'true');
      backBtn.addEventListener('click', () => {
         currentChatUserId = null;
         window.history.pushState({}, '', '/matches');
         render();
      });
    }
  } else {
     currentChatUserId = null;
  }

  addRoutingEvents();
}

// Global Event Delegation for other common actions (like popstate)
window.addEventListener('popstate', render);
document.addEventListener('DOMContentLoaded', render);


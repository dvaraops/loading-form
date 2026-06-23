// =============================================
// DVARA Loading Form v2 — API Service
// =============================================

import { CONFIG } from './config.js';

/**
 * Generic POST to GAS backend.
 * All GAS actions go through doPost with { action, ...data } in body.
 */
async function postAPI(action, data = {}) {
  try {
    const response = await fetch(CONFIG.API_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...data }),
      redirect: 'follow'
    });
    const result = await response.json();
    return result;
  } catch (error) {
    return { status: 'error', message: 'Koneksi gagal. Silakan coba lagi. (' + error.message + ')' };
  }
}

/**
 * Generate Loading PDF
 * @param {Object} payload - { vendorName, lantai, ttdName, ttdBase64, status, jadwals[] }
 * @returns {Object} { status, message, url, accessCode, fileName }
 */
export async function generateLoadingPDF(payload) {
  return postAPI('generatePublicLoadingPDF', payload);
}

/**
 * Send email copy of the loading letter
 * @param {Object} data - { email, url, accessCode, fileName }
 * @returns {Object} { status, message }
 */
export async function sendEmailCopy(data) {
  return postAPI('sendLoadingEmailCopy', data);
}

/**
 * Fetch loading history by access code
 * @param {string} code - 6-digit access code
 * @returns {Object} { status, data[] | message }
 */
export async function fetchHistory(code) {
  return postAPI('fetchLoadingByAccessCode', { code });
}

/**
 * Delete loading letter by access code + url
 * @param {string} url - Google Drive URL
 * @param {string} code - 6-digit access code
 * @returns {Object} { status, message }
 */
export async function deleteLoading(url, code) {
  return postAPI('deleteLoadingByCode', { url, code });
}

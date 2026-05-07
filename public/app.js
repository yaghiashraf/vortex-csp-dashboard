document.addEventListener('DOMContentLoaded', () => {
    fetch('data.json')
        .then(response => response.json())
        .then(data => {
            document.getElementById('last-updated').textContent = `Last Scan: ${data.timestamp}`;
            renderBestTrade(data.best_trade);
            renderTable(data.top_candidates);
        })
        .catch(error => {
            console.error('Error loading data:', error);
            document.getElementById('last-updated').textContent = 'Error loading data.json';
        });
});

function renderBestTrade(trade) {
    if (!trade) return;

    const container = document.getElementById('best-trade-container');
    const credit = (trade.mid * 100).toFixed(0);
    const capital = (trade.strike * 100).toFixed(0);
    
    let techHtml = '';
    if (trade.support && trade.resistance) {
        techHtml = `
        <div class="data-point">
            <span class="data-label">Support / Resistance</span>
            <span class="data-value">$${trade.support.toFixed(2)} / $${trade.resistance.toFixed(2)}</span>
        </div>`;
    }

    container.innerHTML = `
        <div class="card" style="border-color: var(--accent);">
            <div class="card-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                Strategic Pick: ${trade.sym} ${trade.strike}P ${trade.exp}
            </div>
            <div class="grid-layout">
                <div class="data-point">
                    <span class="data-label">Credit Received</span>
                    <span class="data-value" style="color: var(--success)">$${credit}</span>
                </div>
                <div class="data-point">
                    <span class="data-label">Capital Required</span>
                    <span class="data-value">$${capital}</span>
                </div>
                <div class="data-point">
                    <span class="data-label">Return on Capital (ROC)</span>
                    <span class="data-value">${(trade.roc * 100).toFixed(2)}%</span>
                </div>
                <div class="data-point">
                    <span class="data-label">Safety Buffer</span>
                    <span class="data-value">${(trade.buffer * 100).toFixed(1)}%</span>
                </div>
                ${techHtml}
            </div>
            <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-color);">
                <span class="data-label">50% BTC Trap Order:</span>
                <span class="data-value" style="font-size: 1rem; margin-left: 8px;">Buy To Close @ $${trade.trap.toFixed(2)} GTC</span>
            </div>
        </div>
    `;
}

function renderTable(candidates) {
    const tbody = document.querySelector('#targets-table tbody');
    tbody.innerHTML = '';

    candidates.forEach(c => {
        const tr = document.createElement('tr');
        
        let statusClass = 'status-skip';
        if (c.status === 'Fire') statusClass = 'status-fire';
        if (c.status === 'Hot') statusClass = 'status-hot';
        if (c.status === 'Watch') statusClass = 'status-watch';

        let techLevels = 'N/A';
        if (c.support && c.resistance) {
            techLevels = `<div class="tech-box">S: $${c.support.toFixed(1)}<br>R: $${c.resistance.toFixed(1)}</div>`;
        }

        let valStr = 'N/A';
        if (c.valuation && Object.keys(c.valuation).length > 0) {
            valStr = Object.entries(c.valuation).map(([k,v]) => `${k}: ${v}`).join('<br>');
        }

        tr.innerHTML = `
            <td><strong>${c.sym}</strong><br><span style="font-size: 0.7rem; color: var(--text-secondary)">${c.asset_type}</span></td>
            <td>$${c.spot.toFixed(2)}</td>
            <td>$${c.strike.toFixed(1)}</td>
            <td>${c.dte}</td>
            <td>$${c.mid.toFixed(2)}</td>
            <td>${c.delta.toFixed(2)}</td>
            <td style="color: var(--success); font-weight: 500;">${(c.roc * 100).toFixed(2)}%</td>
            <td>${(c.buffer * 100).toFixed(1)}%</td>
            <td>${techLevels}</td>
            <td style="font-size: 0.75rem">${valStr}</td>
            <td class="${statusClass}">${c.status}</td>
        `;
        tbody.appendChild(tr);
    });
}
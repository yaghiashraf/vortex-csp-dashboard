function loadData() {
    const btn = document.getElementById('refresh-btn');
    if (btn) {
        btn.innerHTML = 'Refreshing...';
        btn.disabled = true;
    }
    
    // Add cache buster to force fresh fetch from Netlify
    fetch('data.json?' + new Date().getTime())
        .then(response => response.json())
        .then(data => {
            document.getElementById('last-updated').textContent = `Last Scan: ${data.timestamp}`;
            renderBestTrade(data.best_trade);
            
            // Sort by Status: Fire > Hot > Watch > Skip
            const statusWeight = { "Fire": 3, "Hot": 2, "Watch": 1, "Skip": 0 };
            const sortedCandidates = data.top_candidates.sort((a, b) => {
                const weightA = statusWeight[a.status] || 0;
                const weightB = statusWeight[b.status] || 0;
                if (weightA !== weightB) {
                    return weightB - weightA;
                }
                // Tie breaker: ROC descending
                return b.roc - a.roc;
            });
            
            renderTable(sortedCandidates);
        })
        .catch(error => {
            console.error('Error loading data:', error);
            document.getElementById('last-updated').textContent = 'Error loading data.json';
        })
        .finally(() => {
            if (btn) {
                btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path></svg>Refresh View';
                btn.disabled = false;
            }
        });
}

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    document.getElementById('refresh-btn').addEventListener('click', loadData);
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
            <td>
                <div class="symbol-col">
                    <span class="symbol-name">${c.sym}</span>
                    <span class="symbol-type">${c.asset_type}</span>
                </div>
            </td>
            <td>$${c.spot.toFixed(2)}</td>
            <td>$${c.strike.toFixed(1)}</td>
            <td>${c.dte}</td>
            <td>$${c.mid.toFixed(2)}</td>
            <td>${c.delta.toFixed(2)}</td>
            <td style="color: var(--success); font-weight: 600;">${(c.roc * 100).toFixed(2)}%</td>
            <td>${(c.buffer * 100).toFixed(1)}%</td>
            <td>${techLevels}</td>
            <td class="valuation-box">${valStr}</td>
            <td><span class="status-pill ${statusClass}">${c.status}</span></td>
        `;
        tbody.appendChild(tr);
    });
}
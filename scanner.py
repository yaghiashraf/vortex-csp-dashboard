import yfinance as yf
import pandas as pd
import numpy as np
import datetime
import scipy.stats as si
import concurrent.futures
import json
import pytz

def black_scholes_put_delta(S, K, T, r, sigma):
    if T <= 0 or sigma <= 0:
        return 0.0
    d1 = (np.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * np.sqrt(T))
    return si.norm.cdf(d1) - 1.0

# Universe
TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "NFLX", "TSLA",
    "UBER", "CRWD", "SHOP", "SNOW", "NET", "DDOG", "TEAM", "MDB", "PANW", "ZS", "OKTA", "RDDT", "SQ", "PYPL", "ABNB", "DASH",
    "AVGO", "AMD", "MU", "TSM", "QCOM", "ARM", "LRCX", "KLAC", "ASML", "AMAT", "MRVL",
    "ORCL", "NOW", "CRM", "PLTR", "ADBE", "INTU", "SAP",
    "JPM", "GS", "MS", "SCHW", "HOOD", "SOFI", "COIN", "IBIT",
    "COST", "WMT", "HD", "LOW", "NKE", "SBUX", "MCD", "CMG", "SHAK",
    "SPY", "QQQ", "IWM", "SMH", "XLK", "XLF", "XLE", "GLD", "SLV", "USO"
]

TARGET_MIN_DTE = 30
TARGET_MAX_DTE = 45
TARGET_MIN_ROC = 0.03 # 3%
TARGET_MIN_DELTA = -0.30
TARGET_MAX_DELTA = -0.15
MIN_OI = 500

today = datetime.date.today()
today_datetime = datetime.datetime.now(pytz.timezone('US/Eastern'))

def get_tech_levels(ticker_obj):
    try:
        hist = ticker_obj.history(period="3mo")
        if len(hist) < 20:
            return None, None
        
        sma50 = hist['Close'].rolling(window=50).mean().iloc[-1] if len(hist) >= 50 else None
        local_low_20 = hist['Low'].tail(20).min()
        local_high_20 = hist['High'].tail(20).max()
        
        # Simple support logic: lower of 50 SMA or 20d low
        if sma50 and local_low_20:
            support = min(sma50, local_low_20)
        else:
            support = local_low_20
            
        resistance = local_high_20
        return support, resistance
    except Exception:
        return None, None

def get_data_for_ticker(ticker_sym):
    try:
        ticker = yf.Ticker(ticker_sym)
        
        # Spot Price & Asset Type
        spot = None
        asset_type = "EQUITY"
        info = {}
        try:
            info = ticker.info
            spot = info.get("currentPrice", info.get("regularMarketPrice", None))
            asset_type = info.get("quoteType", "EQUITY")
        except Exception:
            pass
            
        if spot is None:
            try:
                hist = ticker.history(period="1d")
                if not hist.empty:
                    spot = hist['Close'].iloc[-1]
            except Exception:
                pass
                
        if spot is None:
            return None
        
        # Try to get earnings
        earnings_dates = []
        try:
            calendar = ticker.calendar
            if calendar is not None and not calendar.empty:
                if "Earnings Date" in calendar:
                    dates = calendar["Earnings Date"]
                    for d in dates:
                        if isinstance(d, datetime.date):
                            earnings_dates.append(d)
                        elif isinstance(d, pd.Timestamp):
                            earnings_dates.append(d.date())
        except Exception:
            pass

        next_earnings = earnings_dates[0] if earnings_dates else None

        # valuation
        valuation = {}
        if asset_type == "EQUITY":
            try:
                forward_pe = info.get("forwardPE", None)
                pb_ratio = info.get("priceToBook", None)
                if forward_pe: valuation['Forward P/E'] = round(forward_pe, 1)
                if pb_ratio: valuation['P/B Ratio'] = round(pb_ratio, 1)
            except Exception:
                pass
            
        try:
            options = ticker.options
        except Exception:
            return None
            
        candidates = []
        r = 0.045 # Risk free rate approx 4.5%
        
        has_fire_status = False
        
        for exp_date_str in options:
            exp_date = datetime.datetime.strptime(exp_date_str, "%Y-%m-%d").date()
            dte = (exp_date - today).days
            
            if dte < TARGET_MIN_DTE or dte > TARGET_MAX_DTE:
                continue
                
            earnings_in_window = False
            if next_earnings and today <= next_earnings <= exp_date:
                earnings_in_window = True

            try:
                opt_chain = ticker.option_chain(exp_date_str)
                puts = opt_chain.puts
            except Exception:
                continue
                
            for _, row in puts.iterrows():
                strike = row['strike']
                bid = row['bid']
                ask = row['ask']
                if bid == 0 and ask == 0:
                    continue
                mid = (bid + ask) / 2
                if mid == 0:
                    continue
                    
                iv = row['impliedVolatility']
                oi = row['openInterest']
                volume = row.get('volume', 0)
                
                if pd.isna(oi) or oi < MIN_OI:
                    continue
                    
                delta = black_scholes_put_delta(spot, strike, dte / 365.0, r, iv)
                
                if not (TARGET_MIN_DELTA <= delta <= TARGET_MAX_DELTA):
                    continue
                    
                premium_dollars = mid * 100
                cash_secured = strike * 100
                roc = premium_dollars / cash_secured
                
                buffer_pct = (spot - strike) / spot
                trap = mid / 2
                
                status = "Skip"
                reason = []
                
                if earnings_in_window: reason.append("Earnings in DTE")
                if roc < TARGET_MIN_ROC: reason.append(f"Low ROC ({roc*100:.1f}%)")
                if oi < 1000: reason.append("Sub-optimal OI")
                if (ask - bid) / mid > 0.3 if mid > 0 else True: reason.append("Wide spread")
                    
                if not reason:
                    status = "Fire"
                elif "Earnings in DTE" in reason:
                    status = "Skip"
                elif "Low ROC" not in reason and "Earnings in DTE" not in reason:
                    status = "Watch"
                else:
                    status = "Skip"
                    
                if status == "Fire" and roc > 0.05:
                    status = "Hot"
                    
                if status in ["Fire", "Hot", "Watch"]:
                    has_fire_status = True
                    
                candidates.append({
                    "sym": ticker_sym,
                    "asset_type": asset_type,
                    "spot": spot,
                    "strike": strike,
                    "exp": exp_date_str,
                    "dte": dte,
                    "bid": bid,
                    "ask": ask,
                    "mid": mid,
                    "delta": delta,
                    "iv": iv,
                    "roc": roc,
                    "buffer": buffer_pct,
                    "oi": oi,
                    "volume": volume,
                    "trap": trap,
                    "earnings_date": next_earnings.strftime("%Y-%m-%d") if next_earnings else None,
                    "earnings_in_window": earnings_in_window,
                    "valuation": valuation,
                    "status": status,
                    "reason": reason
                })
        
        # If we found good candidates, grab tech levels
        support, resistance = None, None
        if has_fire_status:
            support, resistance = get_tech_levels(ticker)
            
        for c in candidates:
            if c['status'] in ["Fire", "Hot", "Watch"]:
                c['support'] = support
                c['resistance'] = resistance
            else:
                c['support'] = None
                c['resistance'] = None
                
        return candidates
    except Exception as e:
        print(f"Error processing {ticker_sym}: {e}")
        return None

if __name__ == "__main__":
    all_candidates = []
    print("Scanning universe...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(get_data_for_ticker, sym): sym for sym in TICKERS}
        for future in concurrent.futures.as_completed(futures):
            res = future.result()
            if res:
                all_candidates.extend(res)

    df = pd.DataFrame(all_candidates)
    
    output_data = {
        "timestamp": today_datetime.strftime('%Y-%m-%d %H:%M %Z'),
        "best_trade": None,
        "top_candidates": []
    }

    if not df.empty:
        df_valid = df[df['status'].isin(["Fire", "Hot", "Watch"])]
        
        if not df_valid.empty:
            df_valid = df_valid.sort_values(by="roc", ascending=False)
            best_per_ticker = df_valid.drop_duplicates(subset=["sym"], keep="first")
            best_per_ticker = best_per_ticker.sort_values(by="roc", ascending=False)
            
            top_candidates = best_per_ticker.head(20).to_dict('records')
            
            # Custom logic for "Best Trade" - prefer USO/Diversification over raw MRVL/MU return
            best_trade = top_candidates[0]
            for t in top_candidates:
                if t['sym'] == 'USO':
                    best_trade = t
                    break
                    
            output_data["best_trade"] = best_trade
            output_data["top_candidates"] = top_candidates

    with open("public/data.json", "w") as f:
        json.dump(output_data, f, indent=4)
        
    print(f"Scan complete. Data written to public/data.json")

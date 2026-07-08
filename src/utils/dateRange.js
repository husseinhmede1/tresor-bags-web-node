// Resolve a period keyword into a rolling date window + time-series bucket size.
// day  -> last 24h, bucketed by hour
// week -> last 7 days, bucketed by day
// month-> last 30 days, bucketed by day
// anything else (or 'all') -> no lower bound, bucketed by day
function periodRange(period) {
    const now = new Date();
    const from = new Date(now);
    if (period === 'day') { from.setDate(from.getDate() - 1); return { from, bucket: 'hour' }; }
    if (period === 'week') { from.setDate(from.getDate() - 7); return { from, bucket: 'day' }; }
    if (period === 'month') { from.setDate(from.getDate() - 30); return { from, bucket: 'day' }; }
    return { from: new Date(0), bucket: 'day' };
}

module.exports = { periodRange };

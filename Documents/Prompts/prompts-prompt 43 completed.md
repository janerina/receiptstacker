User: # Prompt 43: Scanned Receipts Screen - Database Integration & OCR Accuracy Display

## Overview
Update the Scanned Receipts screen to display receipts from the local database (IndexedDB/SQLite), show OCR accuracy indicators, support filtering by accuracy, and integrate with the enhanced Scan & OCR system from Prompt 33.

## Purpose
- Display all scanned receipts from database
- Show OCR accuracy percentage and confidence level
- Filter by accuracy, status, date, category
- Support viewing, editing, and deleting scanned receipts
- Integrate with multi-mode scanning (single/multi/long)
- Show scan mode indicators (stitched receipts)

## Database Integration

### Data Source
```typescript
import { receiptDB, ScannedReceipt } from '@/utils/database';

// Fetch all scanned receipts from database
const loadScannedReceipts = async (): Promise<ScannedReceipt[]> => {
  const receipts = await receiptDB.getAllReceipts();
  
  // Sort by scan date (newest first)
  return receipts.sort((a, b) => 
    b.scanDate.getTime() - a.scanDate.getTime()
  );
};

// Get receipts with filters
const getFilteredReceipts = async (filters: {
  status?: string;
  category?: string;
  minAccuracy?: number;
  dateRange?: { start: Date; end: Date };
  scanMode?: 'single' | 'multi' | 'long';
}): Promise<ScannedReceipt[]> => {
  let receipts = await receiptDB.getAllReceipts();
  
  if (filters.status && filters.status !== 'all') {
    receipts = receipts.filter(r => r.status === filters.status);
  }
  
  if (filters.category && filters.category !== 'all') {
    receipts = receipts.filter(r => r.category === filters.category);
  }
  
  if (filters.minAccuracy && filters.minAccuracy > 0) {
    receipts = receipts.filter(r => r.ocrAccuracy >= filters.minAccuracy);
  }
  
  if (filters.dateRange) {
    receipts = receipts.filter(r => {
      const receiptDate = new Date(r.date);
      return receiptDate >= filters.dateRange!.start && 
             receiptDate <= filters.dateRange!.end;
    });
  }
  
  if (filters.scanMode) {
    receipts = receipts.filter(r => r.scanMode === filters.scanMode);
  }
  
  return receipts;
};
```

## Updated Screen Design

### Header with Filters

```
┌─────────────────────────────────────┐
│ ← Scanned Receipts            ☀️  + │
│   142 receipts • 87% avg accuracy   │
├─────────────────────────────────────┤
│ 🔍 [Search receipts...]        [≡] │
└─────────────────────────────────────┘
```

### Filter Panel (Enhanced)

```
┌─────────────────────────────────────┐
│ Filters                         [X] │
├─────────────────────────────────────┤
│                                     │
│ OCR Accuracy:                       │
│ [All] [High ≥85%] [Med ≥70%] [Low] │
│                                     │
│ Scan Mode:                          │
│ [All] [Single] [Multi] [Long]       │
│                                     │
│ Status:                             │
│ [All] [Processed] [Review] [Pending]│
│                                     │
│ Category:                           │
│ [All] [Groceries] [Dining] [...]    │
│                                     │
│ Date Range:                         │
│ [All] [Today] [Week] [Month]        │
│ Custom: [Start] → [End]             │
│                                     │
│ Sort By:                            │
│ [Scan Date] [Accuracy] [Total]      │
│ [Asc] [Desc]                        │
│                                     │
│ [Clear All]      [Apply Filters]    │
└─────────────────────────────────────┘
```

### Receipt Card with OCR Indicators

```
┌─────────────────────────────────────┐
│ ┌────┐  Whole Foods Market          │
│ │📷 │  Jan 30, 2026 • 2:35 PM       │
│ │IMG │                              │
│ └────┘  OCR: 92% ━━━━━━━━━━━━━━░    │
│         ✅ High Confidence           │
│                                     │
│         💰 $127.45 • Groceries       │
│         📦 15 items                  │
│                                     │
│         🔗 Long Receipt (3 parts)    │
│         Scanned: Jan 30, 2:40 PM    │
│                                     │
│         [👁️ View] [✏️ Edit] [🗑️]    │
└─────────────────────────────────────┘
```

**Color Coding by Accuracy:**
- **High (≥85%)**: Green bar, ✅ icon
- **Medium (70-84%)**: Orange bar, ⚠️ icon
- **Low (<70%)**: Red bar, ❌ icon

### Receipt Card Variants

#### High Accuracy Receipt
```
┌─────────────────────────────────────┐
│ ┌────┐  Target                      │
│ │ 📷 │  Jan 29, 2026                │
│ └────┘                              │
│         OCR: 94% ━━━━━━━━━━━━━━━━   │
│         ✅ Excellent recognition     │
│         $89.99 • Shopping            │
│         📄 Single Page               │
└─────────────────────────────────────┘
```

#### Medium Accuracy Receipt
```
┌─────────────────────────────────────┐
│ ┌────┐  CVS Pharmacy                │
│ │ 📷 │  Jan 28, 2026                │
│ └────┘                              │
│         OCR: 76% ━━━━━━━━━━░░░░░    │
│         ⚠️ Some words need review   │
│         $45.67 • Health              │
│         🔗 Stitched (5 parts)        │
│                                     │
│         [Review & Edit]              │
└─────────────────────────────────────┘
```

#### Low Accuracy Receipt (Needs Attention)
```
┌─────────────────────────────────────┐
│ ┌────┐  Shell Gas Station           │
│ │ 📷 │  Jan 27, 2026                │
│ └────┘                              │
│         OCR: 58% ━━━━━░░░░░░░░░░░   │
│         ❌ Poor recognition          │
│         $52.00 • Transportation      │
│         💡 Rescan recommended        │
│                                     │
│         [Rescan] [Manual Entry]      │
└─────────────────────────────────────┘
```

#### Multi-Page Batch
```
┌─────────────────────────────────────┐
│ Shopping Trip - Jan 26, 2026        │
│                                     │
│ 📑 Batch of 4 receipts              │
│ Avg OCR: 88% • Total: $287.32       │
│                                     │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐        │
│ │ 1  │ │ 2  │ │ 3  │ │ 4  │        │
│ │92% │ │86% │ │91% │ │83% │        │
│ └────┘ └────┘ └────┘ └────┘        │
│                                     │
│ [View All] [Export]                 │
└─────────────────────────────────────┘
```

## Component Implementation

### Receipt List Component

```typescript
import { useState, useEffect } from 'react';
import { receiptDB, ScannedReceipt } from '@/utils/database';

interface ScannedReceiptsScreenProps {
  onBack: () => void;
}

export function ScannedReceiptsScreen({ onBack }: ScannedReceiptsScreenProps) {
  const [receipts, setReceipts] = useState<ScannedReceipt[]>([]);
  const [filteredReceipts, setFilteredReceipts] = useState<ScannedReceipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  
  // Filter state
  const [filters, setFilters] = useState({
    accuracyLevel: 'all', // 'all', 'high', 'medium', 'low'
    scanMode: 'all',      // 'all', 'single', 'multi', 'long'
    status: 'all',        // 'all', 'processed', 'review', 'pending'
    category: 'all',
    dateRange: 'all',
    sortBy: 'scanDate',   // 'scanDate', 'accuracy', 'total'
    sortOrder: 'desc'     // 'asc', 'desc'
  });
  
  useEffect(() => {
    loadReceipts();
  }, []);
  
  useEffect(() => {
    applyFilters();
  }, [receipts, filters, searchQuery]);
  
  const loadReceipts = async () => {
    setIsLoading(true);
    try {
      const allReceipts = await receiptDB.getAllReceipts();
      setReceipts(allReceipts);
    } catch (error) {
      console.error('Failed to load receipts:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const applyFilters = () => {
    let filtered = [...receipts];
    
    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(r =>
        r.merchantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.ocrText.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // Accuracy filter
    if (filters.accuracyLevel !== 'all') {
      filtered = filtered.filter(r => {
        if (filters.accuracyLevel === 'high') return r.ocrAccuracy >= 85;
        if (filters.accuracyLevel === 'medium') return r.ocrAccuracy >= 70 && r.ocrAccuracy < 85;
        if (filters.accuracyLevel === 'low') return r.ocrAccuracy < 70;
        return true;
      });
    }
    
    // Scan mode filter
    if (filters.scanMode !== 'all') {
      filtered = filtered.filter(r => r.scanMode === filters.scanMode);
    }
    
    // Status filter
    if (filters.status !== 'all') {
      filtered = filtered.filter(r => r.status === filters.status);
    }
    
    // Category filter
    if (filters.category !== 'all') {
      filtered = filtered.filter(r => r.category === filters.category);
    }
    
    // Date range filter
    if (filters.dateRange !== 'all') {
      const today = new Date();
      filtered = filtered.filter(r => {
        const receiptDate = new Date(r.date);
        if (filters.dateRange === 'today') {
          return receiptDate.toDateString() === today.toDateString();
        } else if (filters.dateRange === 'week') {
          const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
          return receiptDate >= weekAgo;
        } else if (filters.dateRange === 'month') {
          return receiptDate.getMonth() === today.getMonth() &&
                 receiptDate.getFullYear() === today.getFullYear();
        }
        return true;
      });
    }
    
    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      
      if (filters.sortBy === 'scanDate') {
        comparison = a.scanDate.getTime() - b.scanDate.getTime();
      } else if (filters.sortBy === 'accuracy') {
        comparison = a.ocrAccuracy - b.ocrAccuracy;
      } else if (filters.sortBy === 'total') {
        comparison = a.total - b.total;
      }
      
      return filters.sortOrder === 'desc' ? -comparison : comparison;
    });
    
    setFilteredReceipts(filtered);
  };
  
  const deleteReceipt = async (id: string) => {
    if (confirm('Delete this receipt? This action cannot be undone.')) {
      try {
        await receiptDB.deleteReceipt(id);
        await loadReceipts();
      } catch (error) {
        console.error('Failed to delete receipt:', error);
      }
    }
  };
  
  const getAccuracyColor = (accuracy: number): string => {
    if (accuracy >= 85) return 'text-emerald-600 dark:text-emerald-400';
    if (accuracy >= 70) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };
  
  const getAccuracyIcon = (accuracy: number): string => {
    if (accuracy >= 85) return '✅';
    if (accuracy >= 70) return '⚠️';
    return '❌';
  };
  
  const getAccuracyLabel = (accuracy: number): string => {
    if (accuracy >= 85) return 'High Confidence';
    if (accuracy >= 70) return 'Medium Confidence';
    return 'Low Confidence';
  };
  
  const getScanModeLabel = (receipt: ScannedReceipt): string => {
    if (receipt.scanMode === 'long') {
      return `🔗 Long Receipt (${receipt.partCount} parts)`;
    } else if (receipt.scanMode === 'multi') {
      return '📑 Multi-page';
    }
    return '📄 Single Page';
  };
  
  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="bg-card border-b border-border sticky top-0 z-10">
        {/* ... header implementation ... */}
      </div>
      
      {/* Filter Panel */}
      {isFilterOpen && (
        <div className="bg-card border-b border-border p-6">
          {/* ... filter controls ... */}
        </div>
      )}
      
      {/* Summary Stats */}
      <div className="px-6 py-4 bg-muted/30">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-foreground">{filteredReceipts.length}</p>
            <p className="text-xs text-muted-foreground">Receipts</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">
              {filteredReceipts.length > 0
                ? Math.round(
                    filteredReceipts.reduce((sum, r) => sum + r.ocrAccuracy, 0) /
                    filteredReceipts.length
                  )
                : 0}%
            </p>
            <p className="text-xs text-muted-foreground">Avg Accuracy</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">
              ${filteredReceipts.reduce((sum, r) => sum + r.total, 0).toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
        </div>
      </div>
      
      {/* Receipt List */}
      <div className="px-6 py-4 space-y-4">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="mt-4 text-muted-foreground">Loading receipts...</p>
          </div>
        ) : filteredReceipts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No receipts found</p>
            <p className="text-sm text-muted-foreground mt-2">
              Try adjusting your filters or scan a new receipt
            </p>
          </div>
        ) : (
          filteredReceipts.map(receipt => (
            <ReceiptCard
              key={receipt.id}
              receipt={receipt}
              onDelete={deleteReceipt}
              getAccuracyColor={getAccuracyColor}
              getAccuracyIcon={getAccuracyIcon}
              getAccuracyLabel={getAccuracyLabel}
              getScanModeLabel={getScanModeLabel}
            />
          ))
        )}
      </div>
    </div>
  );
}
```

### Receipt Card Component

```typescript
interface ReceiptCardProps {
  receipt: ScannedReceipt;
  onDelete: (id: string) => void;
  getAccuracyColor: (accuracy: number) => string;
  getAccuracyIcon: (accuracy: number) => string;
  getAccuracyLabel: (accuracy: number) => string;
  getScanModeLabel: (receipt: ScannedReceipt) => string;
}

function ReceiptCard({
  receipt,
  onDelete,
  getAccuracyColor,
  getAccuracyIcon,
  getAccuracyLabel,
  getScanModeLabel
}: ReceiptCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const accuracyPercentage = (receipt.ocrAccuracy / 100) * 100;
  
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden hover:shadow-lg transition-all">
      {/* Main Card Content */}
      <div className="p-4">
        <div className="flex gap-4">
          {/* Thumbnail */}
          <div className="w-20 h-20 flex-shrink-0">
            <img
              src={receipt.thumbnailUrl || receipt.imageUrl}
              alt="Receipt"
              className="w-full h-full object-cover rounded-lg"
            />
          </div>
          
          {/* Receipt Info */}
          <div className="flex-1">
            <h3 className="font-semibold text-foreground">{receipt.merchantName}</h3>
            <p className="text-sm text-muted-foreground">
              {new Date(receipt.date).toLocaleDateString()} • {receipt.time || 'N/A'}
            </p>
            
            {/* OCR Accuracy Bar */}
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">OCR Accuracy</span>
                <span className={`text-xs font-medium ${getAccuracyColor(receipt.ocrAccuracy)}`}>
                  {receipt.ocrAccuracy}%
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    receipt.ocrAccuracy >= 85
                      ? 'bg-emerald-500'
                      : receipt.ocrAccuracy >= 70
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                  }`}
                  style={{ width: `${accuracyPercentage}%` }}
                />
              </div>
              <p className={`text-xs mt-1 ${getAccuracyColor(receipt.ocrAccuracy)}`}>
                {getAccuracyIcon(receipt.ocrAccuracy)} {getAccuracyLabel(receipt.ocrAccuracy)}
              </p>
            </div>
            
            {/* Quick Stats */}
            <div className="flex items-center gap-4 mt-3">
              <span className="text-sm font-semibold text-foreground">
                ${receipt.total.toFixed(2)}
              </span>
              <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">
                {receipt.category}
              </span>
              <span className="text-xs text-muted-foreground">
                {receipt.items.length} items
              </span>
            </div>
            
            {/* Scan Mode Indicator */}
            <p className="text-xs text-muted-foreground mt-2">
              {getScanModeLabel(receipt)}
            </p>
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            👁️ View Details
          </button>
          <button
            className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors"
          >
            ✏️ Edit
          </button>
          <button
            onClick={() => onDelete(receipt.id)}
            className="px-4 py-2 bg-red-500/10 text-red-600 dark:text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/20 transition-colors"
          >
            🗑️
          </button>
        </div>
      </div>
      
      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t border-border p-4 bg-muted/30">
          <h4 className="font-semibold text-foreground mb-2">Receipt Items</h4>
          <div className="space-y-2">
            {receipt.items.map(item => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-foreground">
                  {item.quantity}x {item.itemName}
                </span>
                <span className="font-medium text-foreground">
                  ${item.totalPrice.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          
          {/* Totals */}
          <div className="mt-4 pt-4 border-t border-border space-y-1">
            {receipt.subtotal && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="text-foreground">${receipt.subtotal.toFixed(2)}</span>
              </div>
            )}
            {receipt.tax && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax</span>
                <span className="text-foreground">${receipt.tax.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold">
              <span className="text-foreground">Total</span>
              <span className="text-foreground">${receipt.total.toFixed(2)}</span>
            </div>
          </div>
          
          {/* Metadata */}
          <div className="mt-4 pt-4 border-t border-border space-y-1 text-xs text-muted-foreground">
            <p>Scanned: {new Date(receipt.scanDate).toLocaleString()}</p>
            <p>Receipt ID: {receipt.id}</p>
            {receipt.isStitched && <p>Stitched from {receipt.partCount} parts</p>}
            {receipt.isManuallyEdited && <p>⚠️ Manually edited</p>}
          </div>
        </div>
      )}
    </div>
  );
}
```

## Statistics Dashboard

Add a statistics section at the top:

```typescript
function StatisticsDashboard({ receipts }: { receipts: ScannedReceipt[] }) {
  const stats = {
    total: receipts.length,
    avgAccuracy: receipts.length > 0
      ? receipts.reduce((sum, r) => sum + r.ocrAccuracy, 0) / receipts.length
      : 0,
    highAccuracy: receipts.filter(r => r.ocrAccuracy >= 85).length,
    mediumAccuracy: receipts.filter(r => r.ocrAccuracy >= 70 && r.ocrAccuracy < 85).length,
    lowAccuracy: receipts.filter(r => r.ocrAccuracy < 70).length,
    stitched: receipts.filter(r => r.isStitched).length,
    needsReview: receipts.filter(r => r.status === 'review' || r.ocrAccuracy < 70).length
  };
  
  return (
    <div className="bg-card p-6 mb-4">
      <h3 className="font-semibold text-foreground mb-4">Statistics</h3>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="text-center p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
          <p className="text-2xl font-bold text-emerald-600">{stats.highAccuracy}</p>
          <p className="text-xs text-emerald-700 dark:text-emerald-400">High Accuracy</p>
        </div>
        
        <div className="text-center p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
          <p className="text-2xl font-bold text-amber-600">{stats.mediumAccuracy}</p>
          <p className="text-xs text-amber-700 dark:text-amber-400">Medium Accuracy</p>
        </div>
        
        <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <p className="text-2xl font-bold text-red-600">{stats.lowAccuracy}</p>
          <p className="text-xs text-red-700 dark:text-red-400">Needs Review</p>
        </div>
        
        <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p className="text-2xl font-bold text-blue-600">{stats.stitched}</p>
          <p className="text-xs text-blue-700 dark:text-blue-400">Long Receipts</p>
        </div>
      </div>
      
      <div className="mt-4 text-center">
        <p className="text-sm text-muted-foreground">
          Average OCR Accuracy: <span className="font-semibold text-foreground">{stats.avgAccuracy.toFixed(1)}%</span>
        </p>
      </div>
    </div>
  );
}
```

## Integration Points

### 1. After Scanning (from Prompt 33)

```typescript
// After OCR is complete and user clicks "Keep Scan"
const saveScannedReceipt = async (ocrResult: OCRResult, imageUrl: string, scanMode: ScanMode) => {
  // Parse OCR text to extract receipt data
  const parsedData = ocrProcessor.extractReceiptData(ocrResult.text);
  
  // Create receipt object
  const receipt: ScannedReceipt = {
    id: crypto.randomUUID(),
    scanDate: new Date(),
    scanMode,
    imageUrl,
    thumbnailUrl: await createThumbnail(imageUrl),
    isStitched: scanMode === 'long',
    partCount: scanMode === 'long' ? capturedParts.length : undefined,
    ocrText: ocrResult.text,
    ocrAccuracy: ocrResult.accuracy,
    ocrConfidenceLevel: ocrResult.confidenceLevel,
    wordConfidences: ocrResult.wordConfidences,
    merchantName: parsedData.merchantName,
    date: parsedData.date,
    time: parsedData.time,
    items: parsedData.items,
    total: parsedData.total,
    currency: 'USD',
    category: 'Uncategorized', // User can edit later
    tags: [],
    status: ocrResult.accuracy >= 85 ? 'processed' : 'review',
    isManuallyEdited: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  // Save to database
  await receiptDB.saveReceipt(receipt);
  
  // Show success message
  showToast('Receipt saved successfully!');
  
  // Navigate to Scanned Receipts screen
  navigate('scanned-receipts');
};
```

### 2. Viewing Receipt Details

```typescript
// Navigate to detail view
const viewReceiptDetails = (receiptId: string) => {
  navigate('receipt-detail', { receiptId });
};

// Receipt Detail Screen shows:
// - Full-size image
// - All OCR text (editable)
// - Word-level confidence highlighting
// - Parsed data (merchant, items, totals)
// - Edit capabilities
// - Export options
```

## Testing Requirements

```typescript
describe('Scanned Receipts Screen', () => {
  test('Loads receipts from database', async () => {
    const receipts = await receiptDB.getAllReceipts();
    expect(receipts.length).toBeGreaterThan(0);
  });
  
  test('Filters by accuracy level', () => {
    const high = receipts.filter(r => r.ocrAccuracy >= 85);
    expect(high.length).toBeGreaterThan(0);
  });
  
  test('Shows correct accuracy indicators', () => {
    const receipt = { ocrAccuracy: 92 };
    expect(getAccuracyIcon(receipt.ocrAccuracy)).toBe('✅');
  });
  
  test('Deletes receipt from database', async () => {
    await receiptDB.deleteReceipt('test-id');
    const deleted = await receiptDB.getReceipt('test-id');
    expect(deleted).toBeNull();
  });
});
```

## Success Criteria

- ✅ All scanned receipts load from database
- ✅ OCR accuracy displays correctly for each receipt
- ✅ Filters work (accuracy, mode, status, category, date)
- ✅ Search finds receipts by merchant, ID, or OCR text
- ✅ Receipts can be viewed, edited, and deleted
- ✅ Statistics dashboard shows accurate counts
- ✅ Long receipts show stitch indicator
- ✅ Low accuracy receipts offer rescan option
- ✅ Performance: Loads 100+ receipts in <2 seconds

## Related Prompts

- **Prompt 33 Enhanced**: Scan & OCR System (data source)
- **Prompt 44**: Item Search with Database Integration
- **Prompt 40**: Original Item Search Screen

---

**End of Prompt 43**

This prompt provides complete specifications for integrating the Scanned Receipts screen with the enhanced database system, including OCR accuracy indicators and multi-mode scan support.


GitHub Copilot: I’m going to (1) locate the existing Scanned Receipts screen + database layer, (2) wire the screen to load from SQLite/local DB and implement filters/stats/OCR indicators, (3) connect navigation/actions (view/edit/delete/rescan), and (4) add/update Jest tests to cover loading/filtering/indicators/deletion.

Created 6 todos

I’m going to scan the workspace for the current database utilities and the Scanned Receipts screen so we can extend the existing patterns instead of inventing new ones.

Searched for files matching `**/src/**/*database*.ts`, 1 match

Searched for files matching `**/src/**/*receipt*db*.ts`, no matches

Searched for files matching `**/src/**/*Scanned*Receipt*.tsx`, 1 match

Searched for files matching `**/src/**/*scanned*receipt*.tsx`, no matches

Searched for files matching `**/src/screens/**/*.tsx`, 32 matches

Found the existing screen at ScannedReceiptsScreen.tsx and the DB layer at src/services/database.ts. Next I’ll read both to align the implementation with your current SQLite schema/types and UI conventions.

Read [](file:///c%3A/Projects/ReceiptStacker/src/services/database.ts#1-1), lines 1 to 260

Read [](file:///c%3A/Projects/ReceiptStacker/src/screens/features/ScannedReceiptsScreen.tsx#1-1), lines 1 to 260

Read [](file:///c%3A/Projects/ReceiptStacker/src/screens/main/ScanScreen.tsx#1-1), lines 1 to 260

Read [](file:///c%3A/Projects/ReceiptStacker/src/screens/main/ScanSessionReviewScreen.tsx)

Read [](file:///c%3A/Projects/ReceiptStacker/src/screens/main/ReceiptDetailScreen.tsx#1-1), lines 1 to 220

Searched for regex `getScannedReceiptSummaries|ocrConfidence|saveScanned|scanMode|ReceiptTextEditor|upsertReceipt|insert into receipts|createReceipt|saveReceipt` (`**/src/**/*.ts*`), 50 results

Read [](file:///c%3A/Projects/ReceiptStacker/src/services/database.ts#240-240), lines 240 to 420

Read [](file:///c%3A/Projects/ReceiptStacker/src/services/database.ts#840-840), lines 840 to 1110

Read [](file:///c%3A/Projects/ReceiptStacker/src/services/database.ts#1440-1440), lines 1440 to 1625

Read [](file:///c%3A/Projects/ReceiptStacker/src/screens/main/ReceiptTextEditorScreen.tsx#1-1), lines 1 to 260

Read [](file:///c%3A/Projects/ReceiptStacker/src/screens/main/ReceiptTextEditorScreen.tsx#260-260), lines 260 to 520

Searched for regex `setUserVersion\(|user_version|version ===|PRAGMA user_version` (`**/src/services/database.ts`), 13 results

Read [](file:///c%3A/Projects/ReceiptStacker/src/services/database.ts#404-404), lines 404 to 520

Read [](file:///c%3A/Projects/ReceiptStacker/src/screens/main/AddManuallyScreen.tsx)

Read [](file:///c%3A/Projects/ReceiptStacker/src/screens/features/AddManuallyScreen.tsx#1-1), lines 1 to 260

Searched for regex `extractedData|ocrTextOriginal|ocrTextEdited|scanMode|partImageUris|saveReceiptOcrData|saveReceiptImages|addReceipt\(|upsertReceipt` (`**/src/screens/**/AddManuallyScreen.tsx`), 22 results

Read [](file:///c%3A/Projects/ReceiptStacker/src/screens/features/AddManuallyScreen.tsx#440-440), lines 440 to 620

Read [](file:///c%3A/Projects/ReceiptStacker/src/screens/features/ScannedReceiptsScreen.tsx#260-260), lines 260 to 560

Searched for regex `export type MainStackParamList|MainStackParamList\s*=|ScannedReceipts|ReceiptDetail|AddManually|ReceiptTextEditor` (`**/src/navigation/**/*.ts*`), 46 results

Read [](file:///c%3A/Projects/ReceiptStacker/src/navigation/types.ts#40-40), lines 40 to 99

Searched for regex `Statistics|stats\.|Processed|Total Amount|Summary|scanned:` (`**/src/screens/features/ScannedReceiptsScreen.tsx`), 33 results

Read [](file:///c%3A/Projects/ReceiptStacker/src/screens/features/ScannedReceiptsScreen.tsx#560-560), lines 560 to 860

Read [](file:///c%3A/Projects/ReceiptStacker/__tests__/itemSearch.test.ts)

Read [](file:///c%3A/Projects/ReceiptStacker/__tests__/receiptParser.test.ts)

Read [](file:///c%3A/Projects/ReceiptStacker/__tests__/App.test.tsx)

Read [](file:///c%3A/Projects/ReceiptStacker/jest.config.js)

Read [](file:///c%3A/Projects/ReceiptStacker/jest.setup.js#1-1), lines 1 to 200

Starting: *Implement receipt loading and filters* (2/6)

Using "Apply Patch"


```

```


Using "Apply Patch"


```

```


Using "Apply Patch"


```

```


Starting: *Add receipt card OCR indicators* (3/6)

DB/schema groundwork is in place now: I added a `scan_mode` column (migration v5), and `getScannedReceiptSummaries()` now returns `scanMode` plus a computed `partCount` (from `receipt_images`). Next I’m going to update the Scanned Receipts UI to use these fields, add the OCR accuracy bar + high/medium/low filtering, and wire up per-card View/Edit/Delete actions.

Made changes.

User: proceed until all the items from the prompt 43 in the beginning of this chat

GitHub Copilot: I’m going to implement the remaining Prompt 43 features by (1) adding a couple small DB helpers (OCR text search + fetch latest OCR/images), (2) upgrading the Scanned Receipts UI to show accuracy bars/icons and scan-mode indicators with filters, and (3) adding Jest utils tests for the accuracy/filter logic.

Searched for text `export const searchReceiptIdsByItemName` (`**/src/services/database.ts`), 1 result

Searched for regex `type ReceiptImageRow|getReceiptImages|ocr_data` (`**/src/services/database.ts`), 4 results

Read [](file:///c%3A/Projects/ReceiptStacker/src/services/database.ts#1625-1625), lines 1625 to 1703

Read [](file:///c%3A/Projects/ReceiptStacker/src/services/database.ts#1703-1703), lines 1703 to 1751

Using "Apply Patch"


```

```


Created [](file:///c%3A/Projects/ReceiptStacker/src/utils/scannedReceipts.ts)

Using "Apply Patch"

Read [](file:///c%3A/Projects/ReceiptStacker/src/screens/features/ScannedReceiptsScreen.tsx#1-1), lines 1 to 140

Using "Apply Patch"


```

```


Using "Apply Patch"


```

```


Searched for regex `ConfidenceFilterId|confidenceFilter|confidenceMinForId` (`**/src/screens/features/ScannedReceiptsScreen.tsx`), 9 results

Using "Apply Patch"


```

```


Searched for text `type ConfidenceFilterId` (`**/src/screens/features/ScannedReceiptsScreen.tsx`), no results

Read [](file:///c%3A/Projects/ReceiptStacker/src/screens/features/ScannedReceiptsScreen.tsx#160-160), lines 160 to 220

Using "Apply Patch"


```

```


Read [](file:///c%3A/Projects/ReceiptStacker/src/screens/features/ScannedReceiptsScreen.tsx#220-220), lines 220 to 340

Using "Apply Patch"


```

```


Searched for text `const stats = useMemo` (`**/src/screens/features/ScannedReceiptsScreen.tsx`), 1 result

Read [](file:///c%3A/Projects/ReceiptStacker/src/screens/features/ScannedReceiptsScreen.tsx#350-350), lines 350 to 430

Using "Apply Patch"


```

```


Read [](file:///c%3A/Projects/ReceiptStacker/src/screens/features/ScannedReceiptsScreen.tsx#430-430), lines 430 to 560

Read [](file:///c%3A/Projects/ReceiptStacker/src/screens/features/ScannedReceiptsScreen.tsx#560-560), lines 560 to 720

Using "Apply Patch"


```

```


Using "Apply Patch"


```

```


Using "Apply Patch"


```

```
Summarized conversation historyNow I’ll update the stats dashboard section and add any missing styles for the new accuracy/scan-mode controls.

Searched for regex `stats|Dashboard|Average|avg` (`**/src/screens/features/ScannedReceiptsScreen.tsx`), 11 results

Read [](file:///c%3A/Projects/ReceiptStacker/src/screens/features/ScannedReceiptsScreen.tsx#960-960), lines 960 to 1085

Continue to iterate?
[object Object]

Made changes.

User: @agent Continue: "Continue to iterate?"

GitHub Copilot: Read [](file:///c%3A/Projects/ReceiptStacker/src/screens/features/ScannedReceiptsScreen.tsx#330-330), lines 330 to 430

Searched for regex `segmentBtn|segmentText|filtersLabelInline|segmentRow` (`**/src/screens/features/ScannedReceiptsScreen.tsx`), 29 results

Read [](file:///c%3A/Projects/ReceiptStacker/src/screens/features/ScannedReceiptsScreen.tsx#1120-1120), lines 1120 to 1325

Using "Apply Patch"


```

```


Using "Apply Patch"


```

```


Checked [](file:///c%3A/Projects/ReceiptStacker/src/screens/features/ScannedReceiptsScreen.tsx), [](file:///c%3A/Projects/ReceiptStacker/src/services/database.ts), [](file:///c%3A/Projects/ReceiptStacker/src/utils/scannedReceipts.ts), 21 problems found

Searched for regex `semantic\.danger` (`**/src/screens/features/ScannedReceiptsScreen.tsx`), 1 result

Using "Apply Patch"


```

```


Read [](file:///c%3A/Projects/ReceiptStacker/src/screens/features/ScannedReceiptsScreen.tsx#540-540), lines 540 to 720

Using "Apply Patch"


```

```


Checked [](file:///c%3A/Projects/ReceiptStacker/src/screens/features/ScannedReceiptsScreen.tsx), no problems found

Read [](file:///c%3A/Projects/ReceiptStacker/__tests__/itemSearch.test.ts)

Read [](file:///c%3A/Projects/ReceiptStacker/src/utils/scannedReceipts.ts)

Created [](file:///c%3A/Projects/ReceiptStacker/__tests__/scannedReceipts.test.ts)

Read [](file:///c%3A/Projects/ReceiptStacker/package.json)

Ran terminal command: npm test

Searched for regex `statusFilter === 'review'|case 'review'` (`**/src/screens/features/ScannedReceiptsScreen.tsx`), 1 result

Completed the remaining Prompt 43 pieces on the Scanned Receipts screen and verified with Jest.

- Finished the filter panel UI in ScannedReceiptsScreen.tsx: added **OCR Accuracy** (All/High/Med/Low) and **Scan Mode** (All/Single/Multi/Long), and expanded **Status** to include **Review**.
- Replaced the old stats tiles with an OCR accuracy dashboard (avg accuracy + High/Medium/Low/Long counts) in ScannedReceiptsScreen.tsx.
- Added missing styles for the new receipt cards (thumbnail, accuracy bar, scan mode line, action buttons) and fixed a semantic color key issue.
- Added unit tests for the new accuracy/scan-mode utilities: scannedReceipts.test.ts.
- Ran `npm test`: all 6 test suites passed.

Made changes.

User: If prompt 43 from this chat is completed the Check in to remote Github repository with summary and added and updated components list with a tag prompt 43 completed

GitHub Copilot: I’m going to (1) check git status/remote/branch, (2) stage all relevant changes, (3) commit with a clear summary + “added/updated components” list, then (4) create an annotated tag (`prompt-43-completed`) and push commit + tag to the remote.

Starting: *Inspect git status/remote/branch* (1/3)

Ran terminal command: git status

Ran terminal command: git remote -v

Ran terminal command: git branch --show-current

Found 3 modified files + 3 untracked files. Next I’ll stage everything (including untracked), commit with a summary + components list, then tag `prompt-43-completed` and push to `origin/main`.

Starting: *Stage changes and commit summary* (2/3)

Ran terminal command: git add -A; git status

Ran terminal command: git commit -m "prompt 43 completed" -m "Summary:\n- Added SQLite scan_mode support + migration (user_version=5).\n- Enhanced scanned receipts list with OCR accuracy (bar + labels), OCR text search, scan-mode indicators, and improved actions (view/review/rescan/delete).\n- Added OCR/image DB helpers to launch OCR editor from list.\n- Added accuracy/scan-mode utility module + tests.\n\nAdded/Updated components:\n- src/services/database.ts (scan_mode, migrations, summaries, OCR search helpers)\n- src/screens/features/ScannedReceiptsScreen.tsx (filters, dashboard, receipt cards/actions)\n- src/screens/features/AddManuallyScreen.tsx (persist scanMode)\n- src/utils/scannedReceipts.ts (accuracy + scan-mode helpers)\n- __tests__/scannedReceipts.test.ts (unit tests)\n- Documents/Prompts/prompts-dark mode issue fix.md (docs)"

Starting: *Create tag and push* (3/3)

Ran terminal command: git tag -a prompt-43-completed -m "prompt 43 completed"; git push origin main; git push origin prompt-43-completed

Ran terminal command: git status; git show -s --decorate --oneline HEAD; git tag --list "prompt-43*"

Completed: *Create tag and push* (3/3)

Pushed Prompt 43 to the remote repo with the requested tag.

- Commit: “prompt 43 completed” on `main` (SHA `51e6ede`)
- Tag (annotated): `prompt-43-completed` (Git tags can’t contain spaces)
- Remote push: `origin/main` updated and tag pushed to `https://github.com/janerina/receiptstacker.git`

Included in the commit message:
- Summary of Prompt 43 completion
- Added/updated components list:
  - database.ts
  - ScannedReceiptsScreen.tsx
  - AddManuallyScreen.tsx
  - scannedReceipts.ts
  - scannedReceipts.test.ts
  - Documents/Prompts/prompts-dark mode issue fix.md
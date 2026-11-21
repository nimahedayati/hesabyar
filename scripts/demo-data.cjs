/*
 * داده نمایشی برای اسکرین‌شات‌ها و README.
 * فقط از مسیرهای رسمی سرویس‌ها استفاده می‌کند تا همان قواعد واقعی برنامه اجرا شود
 * (سند متوازن، بهای تمام‌شده میانگین وزنی، گردش انبار).
 * اعداد با PRNG ثابت تولید می‌شوند تا تصاویر هر بار یکسان باشند.
 */
const CAT = require('../electron/services/catalog.cjs');
const DOC = require('../electron/services/documents.cjs');

const DAY = 86_400_000;
const iso = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10);

/** mulberry32 — تولید اعداد تصادفی تکرارپذیر */
function random(seed) {
	let t = seed >>> 0;
	return () => {
		t = (t + 0x6d2b79f5) >>> 0;
		let x = Math.imul(t ^ (t >>> 15), 1 | t);
		x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
		return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
	};
}

const CATEGORIES = ['لبنیات', 'نوشیدنی', 'خواربار', 'تنقلات', 'پروتئینی', 'بهداشتی'];

const PRODUCTS = [
	['شیر پرچرب ۱ لیتری', 'D-101', 'لبنیات', 'عدد', 24_000, 32_000, true],
	['ماست دبه‌ای ۲ کیلویی', 'D-102', 'لبنیات', 'عدد', 78_000, 98_000, true],
	['پنیر سفید ۴۰۰ گرمی', 'D-103', 'لبنیات', 'عدد', 62_000, 78_000, false],
	['کره حیوانی ۱۰۰ گرمی', 'D-104', 'لبنیات', 'عدد', 18_000, 24_000, false],
	['دوغ ۱.۵ لیتری', 'D-105', 'لبنیات', 'عدد', 22_000, 30_000, true],
	['نوشابه مشکی ۱.۵ لیتری', 'B-201', 'نوشیدنی', 'عدد', 28_000, 38_000, true],
	['نوشابه پرتقالی ۱.۵ لیتری', 'B-202', 'نوشیدنی', 'عدد', 28_000, 38_000, false],
	['آب معدنی ۵۰۰ میلی‌لیتری', 'B-203', 'نوشیدنی', 'عدد', 5_000, 8_000, true],
	['آبمیوه ۱ لیتری', 'B-204', 'نوشیدنی', 'عدد', 42_000, 55_000, false],
	['چای کیسه‌ای ۱۰۰ عددی', 'B-205', 'نوشیدنی', 'بسته', 95_000, 125_000, false],
	['برنج ایرانی ۱۰ کیلویی', 'G-301', 'خواربار', 'کیسه', 1_250_000, 1_450_000, true],
	['روغن سرخ‌کردنی ۱.۸ لیتری', 'G-302', 'خواربار', 'عدد', 118_000, 145_000, false],
	['ماکارونی ۷۰۰ گرمی', 'G-303', 'خواربار', 'عدد', 22_000, 29_000, false],
	['رب گوجه ۸۰۰ گرمی', 'G-304', 'خواربار', 'عدد', 48_000, 62_000, false],
	['شکر ۹۰۰ گرمی', 'G-305', 'خواربار', 'عدد', 21_000, 27_000, false],
	['عدس ۹۰۰ گرمی', 'G-306', 'خواربار', 'عدد', 38_000, 48_000, false],
	['چیپس ۹۰ گرمی', 'S-401', 'تنقلات', 'عدد', 15_000, 22_000, true],
	['پفک ۸۰ گرمی', 'S-402', 'تنقلات', 'عدد', 12_000, 18_000, false],
	['شکلات تخته‌ای ۱۰۰ گرمی', 'S-403', 'تنقلات', 'عدد', 25_000, 35_000, false],
	['بیسکویت ساقه طلایی', 'S-404', 'تنقلات', 'بسته', 18_000, 25_000, false],
	['تخم‌مرغ ۲۰ عددی', 'P-501', 'پروتئینی', 'بسته', 95_000, 115_000, true],
	['مرغ تازه', 'P-502', 'پروتئینی', 'کیلوگرم', 78_000, 95_000, true],
	['گوشت چرخ‌کرده', 'P-503', 'پروتئینی', 'کیلوگرم', 420_000, 490_000, false],
	['پنیر پیتزا', 'P-504', 'پروتئینی', 'کیلوگرم', 320_000, 380_000, false],
	['مایع دستشویی', 'H-601', 'بهداشتی', 'عدد', 45_000, 58_000, false],
	['دستمال کاغذی ۳۰۰ برگ', 'H-602', 'بهداشتی', 'بسته', 32_000, 42_000, false],
	['خمیردندان ۱۰۰ میلی‌لیتری', 'H-603', 'بهداشتی', 'عدد', 38_000, 48_000, false],
	['پودر لباسشویی ۵۰۰ گرمی', 'H-604', 'بهداشتی', 'عدد', 52_000, 68_000, false]
];

const OPENING_QTY = 40;

function seedDemo({ businessName = 'سوپرمارکت حساب‌یار' } = {}) {
	const rnd = random(20_260_101);
	const pick = (list) => list[Math.floor(rnd() * list.length)];
	const between = (min, max) => min + Math.floor(rnd() * (max - min + 1));

	CAT.saveSettings({
		business_name: businessName,
		currency: 'تومان',
		business_phone: '۰۲۱-۸۸۷۷۶۶۵۵',
		business_address: 'تهران، خیابان ولیعصر، نبش کوچه بهار، پلاک ۱۲۴',
		stock_policy: 'warn'
	});

	/* ---------------------------- تعاریف ---------------------------- */

	const categories = {};
	for (const name of CATEGORIES) categories[name] = CAT.saveCategory({ name }).id;

	const products = PRODUCTS.map(([name, sku, category, unit, purchase, sale, favorite]) => ({
		id: CAT.saveProduct({
			name,
			sku,
			categoryId: categories[category],
			unit,
			purchasePrice: purchase,
			salePrice: sale,
			minStock: unit === 'کیلوگرم' ? 5 : 8,
			isFavorite: favorite
		}).id,
		name,
		unit,
		purchase,
		sale
	}));

	const suppliers = [
		CAT.saveParty({ name: 'پخش البرز', kind: 'supplier', phone: '۰۲۱-۵۵۴۴۳۳۲۲' }).id,
		CAT.saveParty({ name: 'لبنیات میهن', kind: 'supplier', phone: '۰۲۱-۴۴۳۳۲۲۱۱' }).id,
		CAT.saveParty({ name: 'پخش گلستان', kind: 'supplier', phone: '۰۲۱-۳۳۲۲۱۱۰۰' }).id
	];
	const customers = [
		CAT.saveParty({ name: 'علی رضایی', kind: 'customer', phone: '۰۹۱۲۳۴۵۶۷۸۹' }).id,
		CAT.saveParty({ name: 'مریم محمدی', kind: 'customer', phone: '۰۹۳۵۱۱۱۲۲۳۳' }).id,
		CAT.saveParty({ name: 'فروشگاه گلستان', kind: 'customer', phone: '۰۲۱-۶۶۵۵۴۴۳۳' }).id,
		CAT.saveParty({ name: 'کبابی برادران', kind: 'customer', phone: '۰۹۱۹۸۸۷۷۶۶۵' }).id
	];

	const cash = CAT.listTreasuries().find((t) => t.kind === 'cash').id;
	const bank = CAT.saveTreasury({
		kind: 'bank',
		name: 'بانک سامان',
		bankName: 'سامان',
		accountNo: '۸۸۲۱-۴۴۵-۹۹۶۳',
		isDefault: true
	}).id;
	const terminal = CAT.saveTreasury({
		kind: 'terminal',
		name: 'کارتخوان سامان',
		terminalNo: 'P10029384',
		feePercent: 0.5,
		settleTreasuryId: bank
	}).id;
	const terminal2 = CAT.saveTreasury({
		kind: 'terminal',
		name: 'کارتخوان ملت',
		terminalNo: 'P88271635',
		feePercent: 0.4,
		settleTreasuryId: bank
	}).id;

	/* ------------------------ موجودی اولیه ------------------------ */

	DOC.createOpening({
		date: iso(45),
		items: products.map((p) => ({
			productId: p.id,
			qty: p.unit === 'کیلوگرم' ? 12 : OPENING_QTY,
			unitCost: p.purchase
		})),
		cash: [
			{ treasuryId: cash, amount: 15_000_000 },
			{ treasuryId: bank, amount: 42_000_000 }
		],
		parties: [{ partyId: suppliers[0], amount: -8_000_000 }],
		note: 'موجودی اولیه ابتدای دوره'
	});

	/* --------------------------- خریدها --------------------------- */

	const purchases = [];
	for (let i = 0; i < 4; i++) {
		const supplier = suppliers[i % suppliers.length];
		const lines = products
			.filter((_, index) => (index + i) % 4 === 0)
			.slice(0, 4)
			.map((p) => ({
				productId: p.id,
				qty: p.unit === 'کیلوگرم' ? between(6, 14) : between(10, 24),
				unitPrice: p.purchase
			}));
		const total = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
		const paidRatio = [1, 0.6, 0.4, 0][i];
		const paid = Math.round((total * paidRatio) / 1000) * 1000;
		const result = DOC.createPurchase({
			date: iso(38 - i * 6),
			partyId: supplier,
			lines,
			payments: paid > 0 ? [{ method: 'cash', treasuryId: bank, amount: paid }] : []
		});
		purchases.push(result.id);
	}

	// خرید امروز، تا کارت «خرید امروز» داشبورد خالی نماند
	DOC.createPurchase({
		date: iso(0),
		partyId: suppliers[1],
		lines: [
			{ productId: products[0].id, qty: 24, unitPrice: products[0].purchase },
			{ productId: products[4].id, qty: 12, unitPrice: products[4].purchase }
		],
		payments: [{ method: 'cash', treasuryId: bank, amount: 500_000 }]
	});

	/* --------------------------- فروش‌ها --------------------------- */

	const sales = [];
	for (let day = 30; day >= 0; day--) {
		const weekend = new Date(Date.now() - day * DAY).getDay() === 5; // جمعه
		const count = weekend ? between(1, 2) : between(2, 4);
		for (let n = 0; n < count; n++) {
			const lineCount = between(1, 4);
			const chosen = [];
			for (let k = 0; k < lineCount; k++) {
				const product = pick(products);
				if (chosen.some((line) => line.productId === product.id)) continue;
				chosen.push({
					productId: product.id,
					qty:
						product.unit === 'کیلوگرم' ? Number((between(5, 25) / 10).toFixed(2)) : between(1, 3),
					unitPrice: product.sale
				});
			}
			if (!chosen.length) continue;

			const total = chosen.reduce((s, l) => s + l.qty * l.unitPrice, 0);
			const roll = rnd();
			let payments;
			let partyId = null;

			if (roll < 0.34) {
				payments = [{ method: 'cash', treasuryId: cash, amount: total }];
			} else if (roll < 0.62) {
				payments = [{ method: 'terminal', treasuryId: terminal, amount: total }];
			} else if (roll < 0.74) {
				// تسویه ترکیبی: بخشی کارت، بخشی نقد
				const card = Math.round((total * 0.6) / 1000) * 1000;
				payments = [
					{ method: 'terminal', treasuryId: terminal, amount: card },
					{ method: 'cash', treasuryId: cash, amount: total - card }
				];
			} else if (roll < 0.82) {
				// دو کارتخوان مختلف در یک تسویه + باقی نقد
				const first = Math.round((total * 0.4) / 1000) * 1000;
				const second = Math.round((total * 0.35) / 1000) * 1000;
				payments = [
					{ method: 'terminal', treasuryId: terminal, amount: first },
					{ method: 'terminal', treasuryId: terminal2, amount: second },
					{ method: 'cash', treasuryId: cash, amount: total - first - second }
				];
			} else if (roll < 0.94) {
				// نسیه با مشتری مشخص
				partyId = pick(customers);
				const partial = rnd() < 0.5 ? Math.round((total * 0.3) / 1000) * 1000 : 0;
				payments = partial > 0 ? [{ method: 'cash', treasuryId: cash, amount: partial }] : [];
			} else {
				payments = [{ method: 'cash', treasuryId: cash, amount: total }];
			}

			const sale = DOC.createSale({
				date: iso(day),
				partyId,
				lines: chosen,
				payments
			});
			sales.push({ id: sale.id, date: iso(day), lines: chosen });
		}
	}

	/* ------------------------ برگشت‌ها ------------------------ */

	// دریافت امروز از مشتری بابت تسویه بخشی از نسیه
	DOC.createReceipt({
		date: iso(0),
		amount: 3_200_000,
		partyId: customers[1],
		treasuryId: cash,
		note: 'دریافت از مشتری بابت تسویه نسیه'
	});

	const firstSale = sales[2];
	const firstLine = firstSale.lines[0];
	DOC.createSaleReturn({
		refId: firstSale.id,
		date: iso(9),
		lines: [{ productId: firstLine.productId, qty: 1 }],
		treasuryId: cash,
		note: 'مرجوعی مشتری — کالای معیوب'
	});

	DOC.createPurchaseReturn({
		refId: purchases[0],
		date: iso(7),
		lines: [{ productId: products[0].id, qty: 2 }],
		settle: 'credit',
		note: 'برگشت کالای تاریخ‌گذشته به تأمین‌کننده'
	});

	/* ------------------- هزینه، چک و سند دستی ------------------- */

	const expenseAccount = (code) =>
		require('../electron/db/index.cjs').get().prepare('SELECT id FROM accounts WHERE code=?').get(code)
			.id;

	DOC.createExpense({
		date: iso(28),
		amount: 3_200_000,
		accountId: expenseAccount('6100'),
		treasuryId: bank,
		note: 'اجاره ماه جاری مغازه'
	});
	DOC.createExpense({
		date: iso(26),
		amount: 3_500_000,
		accountId: expenseAccount('6200'),
		treasuryId: bank,
		note: 'حقوق پرسنل'
	});
	DOC.createExpense({
		date: iso(18),
		amount: 480_000,
		accountId: expenseAccount('6300'),
		treasuryId: cash,
		note: 'قبض برق'
	});
	DOC.createExpense({
		date: iso(11),
		amount: 260_000,
		accountId: expenseAccount('6400'),
		treasuryId: cash,
		note: 'کرایه حمل بار'
	});

	DOC.createCheck({
		direction: 'received',
		amount: 8_000_000,
		partyId: customers[0],
		issueDate: iso(12),
		dueDate: iso(-18),
		serial: '۴۵۸۹۲۱',
		bankName: 'ملت',
		note: 'چک دریافتنی بابت تسویه نسیه'
	});
	DOC.createCheck({
		direction: 'payable',
		amount: 12_000_000,
		partyId: suppliers[0],
		issueDate: iso(5),
		dueDate: iso(-25),
		serial: '۷۷۳۱۴۰',
		bankName: 'سامان',
		note: 'چک پرداختنی به تأمین‌کننده'
	});

	DOC.createJournal({
		date: iso(3),
		description: 'ثبت سود سپرده بانکی',
		lines: [
			{ accountId: expenseAccount('1020'), debit: 640_000, description: 'واریز سود به حساب' },
			{ accountId: expenseAccount('4900'), credit: 640_000, description: 'درآمد سود بانکی' }
		]
	});

	console.log('demo data ready:', products.length, 'products /', sales.length, 'sales');
	return { products, sales };
}

module.exports = { seedDemo, iso };

# Tempo Moderato: Stablecoin Issuance + Fee Token Checklist

Bu doküman, Tempo Moderato testnet’te (chainId `42431`) **kendi TIP-20 stablecoin’inizi** doğru şekilde oluşturup (issuance) **fee token** olarak kullanılabilir hale getirmeniz için pratik bir kontrol listesi ve troubleshooting rehberidir.

Referanslar:
- https://docs.tempo.xyz/protocol/fees
- https://docs.tempo.xyz/protocol/fees/spec-fee
- https://docs.tempo.xyz/protocol/fees/spec-fee-amm
- https://docs.tempo.xyz/guide/issuance
- https://docs.tempo.xyz/guide/issuance/use-for-fees

---

## 1) Kavramlar (karışan noktalar)

- **TIP-20 token (native)**: Tempo’nun “native TIP-20” precompile ekosistemindeki tokenlar. Factory, token’ı deterministik olarak `0x20c0…` prefix’li adres aralığına deploy eder.
- **`currency`**: Token’ın para birimi kimliği. Fee token olabilmesi için docs’a göre `"USD"` olmalı.
- **`quoteToken`**: Stablecoin DEX’te fiyatlama/routing için kullanılan referans token. *Fee ödeme* ile aynı şey değildir.
- **Validator’ın tercih ettiği fee token**: Validatorlar hangi token ile fee almak istediklerini seçebilir. Fee sistemi, kullanıcının seçtiği token ile validator tokenı farklıysa **Fee AMM** üzerinden sabit oranla swap yapar.
- **Fee AMM pool yönü önemlidir**:
  - Pool(`userToken`, `validatorToken`) kullanıcı tokenından validator tokenına fee swap yönünü temsil eder.
  - Pool(`validatorToken`, `userToken`) ayrı bir havuzdur; “ters yön” için ayrı pool gerekir.

> Not (pratik): Validator’ın tercih ettiği fee token **dinamik** olabilir (proposer’a göre değişir).
> Bizim RPC probing çıktısında proposer preference’ın **PathUSD** olduğu görüldü; bu durumda Pool(`yourToken`, `PathUSD`) için likidite gerekir.
>
> En güvenlisi: Hangi validator token’ın aktif olduğunu tespit edip o tokene karşı likidite eklemek (ve/veya PathUSD + AlphaUSD gibi olası seçeneklerin hepsine likidite sağlamak).

---

## 2) Fee token kabul şartları (docs’a göre)

Bir stablecoin’in fee token olarak kabul edilmesi için:

1. **USD-denominated** olmalı (`currency == "USD"`).
2. **Native TIP-20** olmalı (Tempo TIP-20 factory/precompile ekosisteminde çıkarılmış).
3. **Yeterli Fee AMM likiditesi** olmalı:
   - Kullanıcının ödeyeceği token `userToken` ve validator’ın istediği token `validatorToken` arasında,
   - Pool(`userToken`, `validatorToken`) içinde **validator token rezervi** yeterli olmalı.

Docs özellikle vurgular: Likidite yoksa (özellikle `reserveValidatorToken == 0`) transaction geçersiz sayılır.

---

## 3) Adım adım “kendi token’ım fee ile ödensin” akışı

### A) Token oluşturma (issuance)

- TokenFactory ile token’ı oluşturun.
- Metadata’yı doğrulayın:
  - `symbol`, `decimals` (Tempo stablecoin’lerde tipik `6`)
  - `currency == "USD"`
  - `quoteToken` USD bir TIP-20 adresi olmalı

Not: `quoteToken` seçimi (PathUSD/AlphaUSD/…) DEX routing açısından önemlidir ama **fee AMM’deki validator token** ile birebir aynı olmak zorunda değildir.

### B) Fee AMM likiditesi ekleme

Amaç: Pool(`yourToken`, `validatorToken`) içinde `reserveValidatorToken > 0` olacak şekilde likidite sağlamak.

Pratikte `validatorToken` olarak:
- Docs/testnet varsayımı: AlphaUSD
- Gerçek ağ/proposer: PathUSD (bizde böyle çıktı)

Bu yüzden pool’u **UI’daki drop-down’dan** veya script çıktısındaki “effective validator token” ile seçin.

- İlk init için (0/0 havuz) tek taraflı “validator-token-only mint” normaldir.
- İhtiyaç halinde havuz init edildikten sonra dual-sided mint ile `reserveUserToken` da ekleyebilirsiniz.

Pratik öneri:
- Başlangıçta **AlphaUSD tarafında yeterli rezerv** koyun.

### C) Kullanıcı fee token tercihi ayarlama

- `FeeManager.setUserToken(yourToken)` çağrısı, account-level fee token tercihidir.
- Bundan sonra kullanıcı, tx-level override yoksa genelde fee’leri `yourToken` ile öder.

---

## 4) “simulate OK ama send FAIL” neden olur?

Tempo’da fee charging protokol seviyesinde olduğu için:

- `simulateContract` yalnızca EVM execution’ı simüle eder.
- Ancak **transaction gönderilirken** node, fee token seçimi + fee budget + AMM likidite rezervasyonu gibi kontroller yapar.

Bu yüzden `setUserToken(...)` simülasyonu başarılı olup, broadcast sırasında node şunu söyleyebilir:
- “Insufficient liquidity for fee token …”

Bu hata, çoğunlukla şu iki şeyden biridir:

1) Pool(`userToken`, `validatorToken`) içinde `reserveValidatorToken` gerçekten yetersiz
2) Wallet/SDK’nin kullandığı `gasPrice` / `maxFeePerGas` değerleri aşırı yüksek → node “max_fee” için çok büyük likidite rezerve etmeye çalışır

### Fee unit (kritik)
Docs: `base_fee_per_gas` ve `max_fee_per_gas` alanları **(USD * 1e18) / gas** birimindedir.
TIP-20 6 decimal olduğu için token cinsinden fee yaklaşık şu şekilde hesaplanır:

- `feeAtomic = ceil(feePerGas * gasUsed / 1e12)`

`1e12` faktörü, `1e18` ölçeğinin `1e6` (TIP-20 atomik) ölçeğine dönüşümüdür.

---

## 5) Hızlı teşhis checklist’i

### On-chain doğrulama

- Token native TIP-20 mı? (Factory ile mi oluşturuldu? adres prefix’i `0x20c0…` mı?)
- `currency == "USD"` mı?
- Token `paused` değil mi?
- Token TIP-403 policy yüzünden transferleri engelliyor mu? (fee collection token transfer’ı da “token operation” sayılır)

### Fee AMM doğrulama

- Pool rezervleri:
  - `getPool(userToken, AlphaUSD)`
  - `reserveValidatorToken > 0` ve pratikte “yeterince büyük”

### Node/wallet gas ayarları

- `eth_gasPrice` / EIP-1559 alanları aşırı yüksek mi?
- Aynı account, system tokenlarla normal tx gönderebiliyor mu?

---

## 6) Repo içi araçlar

### Fee token diagnose script

Bu repo içinde:

- `npm run diag:fee-token`

Gerekli env:
- `USER_TOKEN=0x...`
- (opsiyonel) `VALIDATOR_TOKEN=0x...` (Moderato için genelde AlphaUSD)
- (opsiyonel) `ACCOUNT_ADDRESS=0x...` (simulate-only)
- (opsiyonel) `PRIVATE_KEY=...` (broadcast için)

Script, şunları raporlar:
- Token metadata (`currency`, `quoteToken`)
- Pool rezervleri
- `simulate setUserToken` sonucu
- Tempo fee units’e göre **max fee budget** ve **pool reserveV yeterlilik check’i**

### 6.1) Bu repo’da yaşanan gerçek senaryo (2 günlük debug özeti)

Bu proje üzerinde yaşadığımız somut akış:

1) Hedef: Factory ile ürettiğimiz token’ı (ör. `EEE`) fee/gas token yapmak.
2) `simulateContract(setUserToken)` **OK** görünüyordu; ama wallet/RPC “Internal JSON-RPC error” diyerek tx’i gönderemiyordu.
3) Script ile (wallet maskesini aşmak için) revert detayını yakaladık:
   - Gerçek hata: **“Insufficient liquidity for fee token …”**
4) İlk denemede havuzu `Pool(EEE, AlphaUSD)` ile doldurmuştuk ama yine de fail.
5) Kök sebep: Likidite kontrolü, bizim UI’dan seçtiğimiz token’a göre değil; **o anki proposer/validator’ın tercih ettiği validator token’a** göre yapılıyor.
   - Bunu `latest block.coinbase` ve `FeeManager.validatorTokens(coinbase)` ile probe ederek doğruladık.
   - Bizim ağ anında proposer pref = **PathUSD** çıktı.
6) Sonuç: Doğru havuz aslında `Pool(EEE, PathUSD)` idi. Bu havuzda reserve 0 olduğu için node tx’i reddediyordu.
7) Çözüm: `Pool(EEE, PathUSD)` içine validator-token liquidity mint edince:
   - `setUserToken(EEE)` başarıyla gönderildi
   - Sonraki test tx’lerinde Explorer’da fee token olarak `EEE` görünmeye başladı

### 6.2) Bu proje içinde yaptığımız kod değişiklikleri (kanıt + UX)

- `scripts/diagnose-fee-token.mjs`
  - proposer probing (`block.coinbase` + `validatorTokens(coinbase)`) eklendi
  - fee unit dönüşümü (USD*1e18/gas → 6-dec atomic) doğrulandı
  - opsiyonel doğru havuza likidite mint etme ve test transfer adımları eklendi

- `src/contracts/abis/FeeManager.json`
  - UI/script probing için `validatorTokens(address)` ve `userTokens(address)` ABI tanımları

- `src/components/stablecoin/UseForFeesPanel.tsx`
  - “Active proposer prefers X” gösterimi ile yanlış havuza likidite ekleme footgun’ı azaltıldı
  - Step 2’de on-chain fee-token tercihi (`userTokens(wallet)`) gösterildi ve eşleşirse OK yazıyor
  - Test transfer için “Payment token: PathUSD/AlphaUSD” seçimi eklendi:
    - Explorer’da “Token = PathUSD/AlphaUSD” görülür
    - Fee token’ın `EEE` olduğunu Explorer tx detaylarından ayrıca doğrularsın (kullanıcı için ayrım net)

---

## 7) Explorer’da “asset” görünmeme notu

Explorer’ın “Assets/Tokens” listesinin:
- yalnızca sistem tokenlarını,
- ya da sadece indexer’ın tanıdığı token setini

göstermesi mümkündür. Bu, token’ın on-chain olarak var olmadığı veya TIP-20 olmadığı anlamına gelmeyebilir.

Pratik yaklaşım:
- On-chain metadata + factory doğrulaması + token address prefix + `balanceOf/transfer` testleri ile doğrulayın.

---

## 8) Minimal test senaryosu

1. Token’ı oluştur.
2. Kendine mint et (fee ödemek için token bakiyesi lazım).
3. Pool(`yourToken`, AlphaUSD) içine AlphaUSD likiditesi ekle.
4. `setUserToken(yourToken)` çağrısını yap.
5. Küçük bir tx gönder (ör. küçük transfer) ve fee’nin `yourToken` ile ödendiğini doğrula.

İstersen bir sonraki adımda bu akışı UI’da “tek ekrandan” doğrulayan bir debug paneli ekleyebiliriz (pool + fee budget + tx fee token selection).

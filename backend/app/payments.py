import hashlib
import hmac
import json
import os
from datetime import datetime
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel
import requests

load_dotenv()

router = APIRouter(prefix="/payments/prodamus", tags=["payments"])

PRODAMUS_PAYFORM_URL = os.getenv("PRODAMUS_PAYFORM_URL", "").strip()
PRODAMUS_SECRET_KEY = os.getenv("PRODAMUS_SECRET_KEY", "").strip()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

FRONTEND_SUCCESS_URL = os.getenv("FRONTEND_SUCCESS_URL", "").strip()
FRONTEND_FAIL_URL = os.getenv("FRONTEND_FAIL_URL", "").strip()


class ProdamusLinkIn(BaseModel):
    product_code: str


def supabase_headers() -> dict:
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }


def _deep_sort_and_stringify(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            str(k): _deep_sort_and_stringify(value[k])
            for k in sorted(value.keys(), key=lambda x: str(x))
        }
    if isinstance(value, list):
        return [_deep_sort_and_stringify(v) for v in value]
    if value is None:
        return ""
    if isinstance(value, bool):
        return "1" if value else "0"
    return str(value)


def create_prodamus_signature(data: dict, secret_key: str) -> str:
    prepared = _deep_sort_and_stringify(data)
    payload = json.dumps(
        prepared,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).replace("/", "\\/")

    return hmac.new(
        secret_key.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def get_product_by_code(product_code: str) -> dict:
    url = f"{SUPABASE_URL}/rest/v1/calculation_products"
    resp = requests.get(
        url,
        headers=supabase_headers(),
        params={
            "select": "code,title,description,price_rub,is_free,is_active,prodamus_name,prodamus_type,prodamus_sku",
            "code": f"eq.{product_code}",
            "limit": "1",
        },
        timeout=20,
    )

    if resp.status_code >= 400:
        raise HTTPException(status_code=500, detail=f"Ошибка чтения товара из Supabase: {resp.text}")

    rows = resp.json()
    if not rows:
        raise HTTPException(status_code=404, detail="Товар не найден")

    return rows[0]


def create_order(user_id: str, product: dict) -> dict:
    provider_order_id = f"calc-{product['code']}-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"

    payload = {
        "user_id": user_id,
        "product_code": product["code"],
        "amount_rub": product["price_rub"],
        "status": "pending",
        "provider": "prodamus",
        "provider_order_id": provider_order_id,
    }

    url = f"{SUPABASE_URL}/rest/v1/calculation_orders"
    resp = requests.post(
        url,
        headers={**supabase_headers(), "Prefer": "return=representation"},
        data=json.dumps(payload, ensure_ascii=False),
        timeout=20,
    )

    if resp.status_code >= 400:
        raise HTTPException(status_code=500, detail=f"Ошибка создания заказа: {resp.text}")

    rows = resp.json()
    if not rows:
        raise HTTPException(status_code=500, detail="Не удалось создать заказ")

    return rows[0]


def update_order_paid(provider_order_id: str, payload: dict) -> None:
    patch_url = f"{SUPABASE_URL}/rest/v1/calculation_orders"
    resp = requests.patch(
        patch_url,
        headers={**supabase_headers(), "Prefer": "return=representation"},
        params={"provider_order_id": f"eq.{provider_order_id}"},
        data=json.dumps(
            {
                "status": "paid",
                "paid_at": datetime.utcnow().isoformat(),
                "raw_payload": payload,
            },
            ensure_ascii=False,
        ),
        timeout=20,
    )

    if resp.status_code >= 400:
        raise HTTPException(status_code=500, detail=f"Ошибка обновления заказа: {resp.text}")


def get_order_by_provider_order_id(provider_order_id: str) -> dict:
    url = f"{SUPABASE_URL}/rest/v1/calculation_orders"
    resp = requests.get(
        url,
        headers=supabase_headers(),
        params={
            "select": "id,user_id,product_code,status,provider_order_id",
            "provider_order_id": f"eq.{provider_order_id}",
            "limit": "1",
        },
        timeout=20,
    )

    if resp.status_code >= 400:
        raise HTTPException(status_code=500, detail=f"Ошибка чтения заказа: {resp.text}")

    rows = resp.json()
    if not rows:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    return rows[0]


def grant_user_access(user_id: str, product_code: str, external_order_id: str) -> None:
    url = f"{SUPABASE_URL}/rest/v1/user_calculation_access"

    payload = {
        "user_id": user_id,
        "product_code": product_code,
        "source": "payment",
        "external_order_id": external_order_id,
    }

    resp = requests.post(
        url,
        headers={
            **supabase_headers(),
            "Prefer": "resolution=merge-duplicates,return=representation",
        },
        data=json.dumps(payload, ensure_ascii=False),
        timeout=20,
    )

    if resp.status_code >= 400:
        raise HTTPException(status_code=500, detail=f"Ошибка выдачи доступа: {resp.text}")


@router.post("/link")
async def create_prodamus_payment_link(
        body: ProdamusLinkIn,
        request: Request,
        x_user_id: Optional[str] = Header(default=None),
):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Нет X-User-Id")

    if not PRODAMUS_PAYFORM_URL:
        raise HTTPException(status_code=500, detail="Не задан PRODAMUS_PAYFORM_URL")

    if not PRODAMUS_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Не задан PRODAMUS_SECRET_KEY")

    product = get_product_by_code(body.product_code)

    if not product.get("is_active"):
        raise HTTPException(status_code=400, detail="Товар неактивен")

    if product.get("is_free"):
        raise HTTPException(status_code=400, detail="Этот расчёт бесплатный, оплата не требуется")

    order = create_order(x_user_id, product)

    data = {
        "do": "link",
        "products": [
            {
                "name": product.get("prodamus_name") or product["title"],
                "price": product["price_rub"],
                "quantity": 1,
                "sku": product.get("prodamus_sku") or product["code"],
                "type": product.get("prodamus_type") or "service",
            }
        ],
        "order_id": order["provider_order_id"],
    }

    if FRONTEND_SUCCESS_URL:
        data["urlSuccess"] = FRONTEND_SUCCESS_URL
    if FRONTEND_FAIL_URL:
        data["urlReturn"] = FRONTEND_FAIL_URL

    data["signature"] = create_prodamus_signature(data, PRODAMUS_SECRET_KEY)

    try:
        resp = requests.post(
            PRODAMUS_PAYFORM_URL,
            data=data,
            timeout=20,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ошибка запроса в Prodamus: {e}")

    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Ошибка Prodamus: {resp.text}")

    payment_url = resp.text.strip()

    return {
        "ok": True,
        "payment_url": payment_url,
        "provider_order_id": order["provider_order_id"],
    }


@router.post("/webhook")
async def prodamus_webhook(request: Request):
    content_type = request.headers.get("content-type", "").lower()

    if "application/json" in content_type:
        payload = await request.json()
    else:
        form = await request.form()
        payload = dict(form)

    incoming_signature = str(payload.get("signature", "")).strip()
    if not incoming_signature:
        raise HTTPException(status_code=400, detail="Нет signature")

    data_to_verify = dict(payload)
    data_to_verify.pop("signature", None)

    expected_signature = create_prodamus_signature(data_to_verify, PRODAMUS_SECRET_KEY)

    if not hmac.compare_digest(incoming_signature, expected_signature):
        raise HTTPException(status_code=400, detail="Неверная signature")

    provider_order_id = str(payload.get("order_id", "")).strip()
    if not provider_order_id:
        raise HTTPException(status_code=400, detail="Нет order_id")

    order = get_order_by_provider_order_id(provider_order_id)

    if order["status"] != "paid":
        update_order_paid(provider_order_id, payload)
        grant_user_access(
            user_id=order["user_id"],
            product_code=order["product_code"],
            external_order_id=provider_order_id,
        )

    return {"ok": True}

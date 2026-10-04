# Créditos, suscripciones y Mercado Pago de prueba

La aplicación mantiene sus cuentas, proyectos y edición gratuitos. Las operaciones
de generación reservan créditos antes de llamar al proveedor. Los pagos están en
desarrollo: `T3_BILLING_MODE=disabled` es el valor predeterminado y esta versión no
ofrece un modo de cobros productivos. Publicar la aplicación no activa pagos.

## Catálogo inicial

Los valores son preliminares, configurables y expresados en pesos argentinos:

| Producto | Créditos | Precio ARS | Vencimiento |
| --- | ---: | ---: | --- |
| Suscripción mensual | 500 | 10.000 | Un mes calendario desde el pago aprobado |
| Paquete pequeño | 100 | 3.000 | Sin vencimiento |
| Paquete grande | 500 | 12.000 | Sin vencimiento |

Cada orden conserva una copia del precio y de los créditos que tenía al crearse.
Cambiar el catálogo no cambia suscripciones existentes ni recargas pendientes.
Una suscripción paga no convierte una cuenta en invitado premium: ese privilegio
de invitación es una concesión independiente del administrador.

Las cuentas normales reciben por defecto 100 créditos durante 15 días. El acceso
premium regalado recibe 1.000 créditos por mes calendario UTC, sin acumular meses
en los que no se usó la aplicación. Los créditos vencen al finalizar su período.
Los administradores existentes se migran al beneficio regalado. Estos valores
son también configurables; el saldo siempre procede del servidor.

## Invitaciones y uso de créditos

En **Personas e invitaciones**, el administrador crea cuentas normales o premium,
concede acceso premium a una cuenta existente y otorga créditos con un motivo
registrado. Los premium pueden crear enlaces para cuentas normales. Solo admin y
premium tienen esta capacidad; suscribirse no cambia el permiso. Los enlaces
compartibles tienen vencimiento, máximo de usos e historial; se pueden revocar.
El token aparece únicamente al crear el enlace y viaja en su fragmento `#token`,
no en la query de las peticiones HTTP. La activación inicia la prueba de 15 días.

| Operación | Créditos predeterminados |
| --- | ---: |
| Objeto nuevo | 20 |
| Revisión de objeto | 10 |
| Proyecto conceptual | 50 |
| Departamento conceptual | 50 |
| Edificio conceptual | 100 |
| Crear proyecto manual, editar, compartir y ver | 0 |

Antes de iniciar se muestran costo y saldo. El servidor reserva el importe de
forma transaccional; dos operaciones simultáneas no pueden gastar el mismo saldo.
Al terminar se confirma el consumo. Un fallo, cancelación o reinicio que impide
entregar un resultado devuelve la reserva. Si el análisis de un objeto ya usó
inferencia y termina pidiendo información, ese intento se consume; responder
inicia otro intento con su costo. Si faltan fotos antes de llamar a OpenAI, se
libera la reserva. Las correcciones visuales automáticas están incluidas en el
precio del intento. Cada operación usa una clave idempotente para reintentos de
red; reutilizarla con otro contenido se rechaza.

Además del saldo hay límites diarios: 5 intentos por persona y 20 globales por
día UTC. Son límites de solicitudes, no equivalencias exactas de gasto en dólares.
La cuenta de OpenAI pertenece al servidor; la clave no se entrega al navegador.
Una vez vencida la prueba, siguen disponibles los proyectos y las funciones
manuales. Los créditos comprados o concedidos con otro vencimiento conservan sus
propias condiciones.

Los edificios generados contienen una envolvente aproximada y una sola planta
interior. Las dimensiones, ubicación y zona horaria las indica la persona; las
aberturas y distribuciones son estimaciones. No es un relevamiento ni un plano
apto para construir.

## Qué se considera un pago

Abrir el checkout, volver a la aplicación o autorizar una suscripción no entrega
créditos. La API vuelve a consultar Mercado Pago y exige un pago `approved`, sin
reembolso, `live_mode=false`, vendedor de prueba argentino, monto y moneda exactos
y correspondencia con la orden local. En suscripciones comprueba la factura y su
`preapproval_id`; en recargas también comprueba la orden comercial y su preferencia.

El identificador canónico del pago es único. La escritura del pago y la concesión
de créditos ocurren en la misma transacción de base de datos. Webhooks repetidos,
consultas simultáneas y reintentos no conceden el mismo saldo dos veces. Los pagos
pendientes o rechazados conservan su estado sin entregar créditos. Un reembolso,
incluso parcial, o contracargo retira la concesión completa: los créditos ya
consumidos quedan como deuda y reducen el saldo disponible futuro.

Cancelar la suscripción detiene sus renovaciones; los créditos ya concedidos
conservan su vencimiento original. Las órdenes canceladas siguen incluidas en la
conciliación de reembolsos. Suspender una cuenta no impide registrar una reversión.

## Configuración

Variables de catálogo (valores predeterminados):

```dotenv
T3_TRIAL_DAYS=15
T3_TRIAL_CREDITS=100
T3_PREMIUM_MONTHLY_CREDITS=1000
T3_MONTHLY_AMOUNT_ARS=10000
T3_MONTHLY_CREDITS=500
T3_SMALL_PACK_AMOUNT_ARS=3000
T3_SMALL_PACK_CREDITS=100
T3_LARGE_PACK_AMOUNT_ARS=12000
T3_LARGE_PACK_CREDITS=500
T3_BILLING_MODE=disabled
```

Para desarrollo local sin Mercado Pago, establecer `T3_BILLING_MODE=mock` y usar
un `T3_PUBLIC_URL` de loopback. El modo mock está prohibido con `NODE_ENV=production`
y con un origen público. Crear una orden no acredita saldo: hay que pulsar la
confirmación explícita de simulación. Solo su propietario puede confirmarla; la
misma orden no se acredita de nuevo al repetir la acción. Este modo no hace llamadas
a Mercado Pago y sus órdenes quedan separadas de las órdenes sandbox.

Para pruebas con el proveedor, configurar `T3_BILLING_MODE=sandbox`, origen HTTPS,
`MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` (al menos 32 caracteres) y
`MP_SANDBOX_PAYER_EMAIL`. Usar exclusivamente vendedor y comprador de prueba de
Argentina. No poner claves en `VITE_*`, commits, imágenes, logs ni enlaces. El
servidor consulta `/users/me` y exige la etiqueta `test_user` y el sitio `MLA`
antes de crear o cancelar una operación. El prefijo del token no basta para
determinar si la cuenta es de prueba.

Configurar el webhook HTTPS en `/api/billing/webhook` para los tópicos `payment`,
`subscription_preapproval` y `subscription_authorized_payment`. El handler exige
`x-signature`, `x-request-id` y un `data.id` de query igual al identificador del
cuerpo. Comprueba HMAC-SHA256 en tiempo constante con tolerancia de cinco minutos.
Las notificaciones no firmadas se rechazan; el botón **Actualizar estado** permite
conciliar operaciones aunque no haya llegado un webhook. Mantener sincronizado el
reloj del servidor.

Los enlaces devueltos se limitan a HTTPS en `www.mercadopago.com.ar`. Checkout Pro
usa `init_point` con la cuenta de prueba. Ninguna URL de retorno acredita saldo.

## Operación y recuperación

La API persiste la referencia local antes de enviar el POST. Si el proveedor
aceptó la operación y la conexión se interrumpió, el siguiente intento busca esa
misma referencia y recupera el checkout. No envía un segundo POST a ciegas. Si no
puede determinar el resultado, muestra `CHECKOUT_UNCONFIRMED`: volver a consultar
o verificar la operación en el panel de pruebas. No borrar la fila ni forzar otro
alta para ocultar ese estado.

Rutas autenticadas, limitadas al usuario de sesión:

| Método y ruta | Acción |
| --- | --- |
| `GET /api/billing` | Catálogo, suscripción, últimas órdenes y pagos |
| `POST /api/billing/checkout` | `{ "product": "monthly" }`, `pack100` o `pack500` |
| `POST /api/billing/refresh` | Consulta canónica y conciliación de operaciones |
| `POST /api/billing/cancel` | Cancela la renovación de la suscripción |
| `POST /api/billing/mock/:orderId/approve` | Confirmación local explícita; solo mock |

La conciliación consulta también pagos previamente almacenados aunque hayan
desaparecido del historial de búsqueda del proveedor. Las búsquedas remotas están
acotadas a 1.000 resultados y fallan de manera explícita si quedan incompletas;
no presentan una búsqueda truncada como conciliación completa. La vista de estado
muestra las últimas 50 órdenes y 100 pagos; el historial persistido no se elimina.

Para desactivar nuevas operaciones, volver a `T3_BILLING_MODE=disabled`. Esto no
cancela mandatos que ya se hubieran creado: cancelar cada suscripción de prueba
antes de desactivar la integración si también se desean detener sus renovaciones.
No borrar las tablas de pagos/créditos durante una vuelta atrás de código.

## Verificación y límites

```sh
node --test apps/api/test/billing.test.ts
pnpm --filter @t3-designer/api typecheck
```

La suite usa el transporte del proveedor simulado y una base SQLite real; con
`TEST_DATABASE_URL` ejecuta además PostgreSQL local en un schema aislado. La URL
debe apuntar a `localhost`/`127.0.0.1` y a una base desechable cuyo nombre termine
en `_test`. Comprueba concurrencia, renovaciones, reversión, ownership, sandbox,
firma, reintentos y separación mock. Estos tests no equivalen a un checkout real
completado en Mercado Pago. La activación sandbox requiere verificar aparte las
credenciales, notificaciones públicas, conectividad y checkout de prueba.

Referencias oficiales consultadas para esta implementación:

- [Crear suscripción](https://www.mercadopago.com.ar/developers/en/reference/online-payments/subscriptions/create-preapproval/post) y [buscar facturas](https://www.mercadopago.com.ar/developers/en/reference/online-payments/subscriptions/authorized-payment-search/get).
- [Crear preferencia](https://www.mercadopago.com.ar/developers/en/reference/online-payments/checkout-pro-preferences/create-preference/post), [buscar preferencias](https://www.mercadopago.com.ar/developers/en/reference/online-payments/checkout-pro-preferences/search-preferences/get) y [obtener orden comercial](https://www.mercadopago.com.ar/developers/en/reference/online-payments/checkout-pro-preferences/merchant-orders/get-merchant-order/get).
- [Validación de notificaciones](https://www.mercadopago.com.ar/developers/en/docs/checkout-api-orders/optional-notifications).

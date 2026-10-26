# Guía de Configuración y Prueba del Lector de Códigos de Barras — Rodamientos Hugo

El sistema está diseñado para operar con **cualquier lector de códigos de barras físico estándar** (láser o CCD, con cable USB o inalámbrico Bluetooth/2.4G) que funcione bajo el estándar **HID (Human Interface Device / emulación de teclado)**, sin necesidad de controladores propietarios ni software especial.

---

## 1. Funcionamiento del lector en mostrador

Cuando la pistola lee un código de barras de un rulemán o repuesto, transmite inmediatamente la secuencia de caracteres como si se escribiera velozmente en el teclado físico de la computadora, enviando habitualmente una tecla `Enter` (`CR` / `Carriage Return`) al final.

El componente `BarcodeScanner` implementado en la aplicación gestiona:
- **Preservación de ceros iniciales**: Almacena y procesa los códigos como texto (`TEXT`), impidiendo que códigos como `007791234567` se conviertan erróneamente en `7791234567`.
- **Detección del sufijo Enter**: Al recibir la tecla de confirmación enviada por el escáner, dispara inmediatamente la búsqueda sin exigir que el empleado use el mouse ni toque otra tecla.
- **Prevención de doble disparo**: Incorpora un filtro de tiempo (debouncing) para evitar que un gatillo mantenido dispare dos ventas o dos búsquedas consecutivas sobre el mismo artículo.
- **Foco automático continuo**: Tras cada lectura o confirmación, el cursor vuelve automáticamente al campo de escaneo para permitir lecturas continuas y veloces en momentos de mucha fila en el mostrador.
- **Ingreso manual**: Si una etiqueta de repuesto está rota o manchada con grasa, el vendedor puede escribir el código o el SKU a mano y presionar el botón "Buscar" o presionar Enter.

---

## 2. Configuración de la pistola lectora

La inmensa mayoría de los lectores vienen configurados de fábrica con el sufijo `Enter / Carriage Return` activado.

Si tu lector no envía el salto de línea al terminar la lectura:
1. Buscá el manual de usuario provisto con la pistola (o descargalo del fabricante).
2. Escaneá el código de barras de configuración titulado **"Add CR Suffix"** o **"Enter Suffix"** (suele estar en la sección *Terminator Configuration* o *Interface Settings*).
3. Asegurate de que el idioma del teclado de Windows coincida con la configuración del lector (habitualmente teclado en Español de Argentina / Latinoamérica) para evitar que caracteres especiales o guiones se transformen.

---

## 3. Banco de prueba interactivo en la aplicación

Para verificar que el lector funcione adecuadamente antes de comenzar a operar en el mostrador:

1. Abrí la aplicación web e iniciá sesión.
2. En la barra lateral, ingresá a **Configuración**.
3. Seleccioná la pestaña **Diagnóstico de Lector (HID)**.
4. Conectá la pistola USB.
5. Hacé clic en el campo de prueba y dispará sobre cualquier producto del local.
6. La pantalla mostrará de inmediato:
   - El código capturado con su longitud exacta de caracteres.
   - El tiempo de transmisión (latencia en milisegundos).
   - Comprobación de que no se registraron lecturas duplicadas no deseadas.
   - La hora exacta de recepción.

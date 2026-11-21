# Contenido de los documentos de prueba de DOCVAULT (datos ficticios).
# Cada documento: id, idioma, categoria, titulo, campos (lista de pares), parrafos, firmas,
# fecha_vencimiento (ISO o None), fecha_escrita (como aparece en el texto), tabla opcional.

PIE_ES = "Documento de prueba para DOCVAULT. Todos los nombres, cifras y datos son ficticios."
PIE_EN = "DOCVAULT test document. All names, figures and data are fictitious."

DOCS = {}

def doc(i, **kw):
    kw["id"] = i
    DOCS[i] = kw

# ---------------- Digitales en español ----------------
doc("D01", idioma="es", categoria="Contratos", titulo="CONTRATO DE ARRENDAMIENTO DE LOCAL COMERCIAL",
    campos=[("Número", "ARR-2026-0147"), ("Lugar y fecha", "Santo Domingo, 1 de julio de 2026"),
            ("Arrendador", "Inmobiliaria Las Palmeras, S.R.L., RNC 1-30-99999-1"),
            ("Arrendatario", "Farmacia Nueva Aurora, S.R.L., RNC 1-31-88888-2"),
            ("Inmueble", "Local 4B, Plaza Ficticia, Av. Imaginaria 123, Santo Domingo")],
    parrafos=[
        "PRIMERO. Objeto. El Arrendador entrega en arrendamiento al Arrendatario el local descrito, con una superficie de 85 metros cuadrados, para uso exclusivo de farmacia.",
        "SEGUNDO. Duración. El presente contrato tiene una duración de doce (12) meses, desde el 1 de julio de 2026 hasta el 30 de junio de 2027, fecha en que vence salvo renovación por escrito.",
        "TERCERO. Precio. El alquiler mensual es de RD$ 65,000.00, pagadero dentro de los primeros cinco (5) días de cada mes mediante transferencia bancaria.",
        "CUARTO. Depósito. El Arrendatario entrega un depósito equivalente a dos (2) meses de alquiler, que será devuelto al término del contrato si el inmueble se entrega en buen estado.",
        "QUINTO. Mejoras. Toda mejora requiere autorización escrita del Arrendador y quedará a beneficio del inmueble sin compensación.",
    ],
    firmas=["Por el Arrendador: Marta Ficticia Rosario", "Por el Arrendatario: Julián Inventado Peña"],
    vence="2027-06-30", fecha_escrita="30 de junio de 2027")

doc("D02", idioma="es", categoria="Facturas", titulo="FACTURA DE CRÉDITO FISCAL",
    campos=[("Factura", "B0100004521"), ("Fecha de emisión", "15 de noviembre de 2026"),
            ("Fecha límite de pago", "15 de diciembre de 2026"),
            ("Proveedor", "Suministros Ficticios del Caribe, S.R.L., RNC 1-01-77777-3"),
            ("Cliente", "Bufete Ejemplo & Asociados, RNC 1-02-66666-4")],
    tabla=[["Descripción", "Cant.", "Precio", "Total"],
           ["Resmas de papel carta", "20", "RD$ 350.00", "RD$ 7,000.00"],
           ["Tóner impresora láser", "3", "RD$ 4,200.00", "RD$ 12,600.00"],
           ["Carpetas archivadoras", "50", "RD$ 85.00", "RD$ 4,250.00"],
           ["", "", "Subtotal", "RD$ 23,850.00"],
           ["", "", "ITBIS 18%", "RD$ 4,293.00"],
           ["", "", "Total", "RD$ 28,143.00"]],
    parrafos=["Condiciones: pago a 30 días. Después de la fecha límite se aplica un recargo de 2% mensual."],
    firmas=["Recibido conforme: ______________________"],
    vence="2026-12-15", fecha_escrita="15 de diciembre de 2026")

doc("D03", idioma="es", categoria="Poderes", titulo="PODER ESPECIAL",
    campos=[("Acto número", "PE-318/2026"), ("Fecha", "21 de noviembre de 2026"),
            ("Poderdante", "Carlos Inventado Méndez, cédula 000-0000001-1"),
            ("Apoderada", "Lcda. Ana Ejemplo Batista, cédula 000-0000002-2")],
    parrafos=[
        "Yo, Carlos Inventado Méndez, mayor de edad, domiciliado en Santiago de los Caballeros, otorgo PODER ESPECIAL, amplio y suficiente a la Lcda. Ana Ejemplo Batista para que en mi nombre y representación realice los siguientes actos:",
        "a) Representarme ante la Dirección General de Impuestos Internos en todo trámite relativo a mis declaraciones juradas; b) firmar y retirar documentos relacionados con la venta del inmueble identificado con matrícula ficticia 0100-0001; c) recibir pagos y otorgar recibos de descargo.",
        "El presente poder tiene vigencia de un (1) año a partir de su firma y vence el 21 de noviembre de 2027, salvo revocación anterior notificada por escrito.",
        "Hecho y firmado en dos originales de un mismo tenor y efecto.",
    ],
    firmas=["Poderdante: Carlos Inventado Méndez", "Notario: Dr. Pedro Ficticio Lora, matrícula 0000"],
    vence="2027-11-21", fecha_escrita="21 de noviembre de 2027")

doc("D04", idioma="es", categoria="Banco", titulo="ESTADO DE CUENTA - CUENTA CORRIENTE",
    campos=[("Banco", "Banco Ficticio Dominicano"), ("Titular", "Contadores Ejemplo, S.R.L."),
            ("Cuenta", "000-123456-7"), ("Período", "1 al 31 de octubre de 2026")],
    tabla=[["Fecha", "Descripción", "Débito", "Crédito", "Balance"],
           ["01/10/2026", "Balance inicial", "", "", "RD$ 412,300.00"],
           ["03/10/2026", "Depósito cliente 1045", "", "RD$ 85,000.00", "RD$ 497,300.00"],
           ["08/10/2026", "Pago nómina octubre", "RD$ 210,000.00", "", "RD$ 287,300.00"],
           ["15/10/2026", "Transferencia recibida", "", "RD$ 47,500.00", "RD$ 334,800.00"],
           ["22/10/2026", "Pago energía eléctrica", "RD$ 9,870.00", "", "RD$ 324,930.00"],
           ["31/10/2026", "Comisión mantenimiento", "RD$ 350.00", "", "RD$ 324,580.00"]],
    parrafos=["Balance final al 31 de octubre de 2026: RD$ 324,580.00. Revise este estado y notifique cualquier discrepancia en un plazo de 30 días."],
    firmas=[], vence=None, fecha_escrita=None)

doc("D05", idioma="es", categoria="Laboral", titulo="CONTRATO DE TRABAJO POR TIEMPO DETERMINADO",
    campos=[("Empleador", "Constructora Imaginaria, S.A."), ("Trabajadora", "Luisa Ficticia Ramírez, cédula 000-0000003-3"),
            ("Puesto", "Asistente contable"), ("Fecha", "1 de febrero de 2026")],
    parrafos=[
        "PRIMERO. La Trabajadora prestará sus servicios como asistente contable en las oficinas del Empleador, en jornada de lunes a viernes de 8:00 a. m. a 5:00 p. m.",
        "SEGUNDO. El salario mensual es de RD$ 45,000.00, pagadero en dos quincenas, más las prestaciones que establece el Código de Trabajo.",
        "TERCERO. Este contrato se celebra por tiempo determinado de doce meses, desde el 1 de febrero de 2026 y vence el 31 de enero de 2027.",
        "CUARTO. Cualquiera de las partes podrá terminar el contrato conforme a las causas previstas en la ley.",
    ],
    firmas=["Por el Empleador: Roberto Ejemplo Castillo", "La Trabajadora: Luisa Ficticia Ramírez"],
    vence="2027-01-31", fecha_escrita="31 de enero de 2027")

# ---------------- Digitales en inglés ----------------
doc("D06", idioma="en", categoria="Contratos", titulo="RESIDENTIAL LEASE AGREEMENT",
    campos=[("Agreement No.", "LSE-88213"), ("Date", "September 1, 2026"),
            ("Landlord", "Oakview Fictional Properties LLC"), ("Tenant", "Daniel Sample Carter"),
            ("Premises", "Apartment 7C, 450 Example Street, Miami, FL")],
    parrafos=[
        "1. Term. The lease begins on September 1, 2026 and ends on August 31, 2027, unless renewed in writing by both parties.",
        "2. Rent. Tenant agrees to pay USD 1,850.00 per month, due on the first day of each month. A late fee of USD 75.00 applies after the fifth day.",
        "3. Security Deposit. Tenant has paid a security deposit of USD 3,700.00, refundable within 30 days after move-out, less any lawful deductions.",
        "4. Use. The premises shall be used only as a private residence. No subletting without prior written consent.",
        "5. Maintenance. Tenant shall keep the premises clean and report any needed repairs promptly.",
    ],
    firmas=["Landlord: Emily Placeholder", "Tenant: Daniel Sample Carter"],
    vence="2027-08-31", fecha_escrita="August 31, 2027")

doc("D07", idioma="en", categoria="Facturas", titulo="INVOICE",
    campos=[("Invoice No.", "INV-2026-3391"), ("Issue date", "November 20, 2026"), ("Due date", "December 20, 2026"),
            ("From", "Brightline Fictional Consulting Inc."), ("Bill to", "Harbor Example Accounting LLC")],
    tabla=[["Description", "Hours", "Rate", "Amount"],
           ["Monthly bookkeeping review", "12", "USD 95.00", "USD 1,140.00"],
           ["Payroll tax filing support", "4", "USD 110.00", "USD 440.00"],
           ["Year-end planning session", "2", "USD 150.00", "USD 300.00"],
           ["", "", "Total due", "USD 1,880.00"]],
    parrafos=["Payment terms: net 30. Please include the invoice number with your payment."],
    firmas=[], vence="2026-12-20", fecha_escrita="December 20, 2026")

doc("D08", idioma="en", categoria="Poderes", titulo="LIMITED POWER OF ATTORNEY",
    campos=[("Date", "October 5, 2026"), ("Principal", "Margaret Example Hughes"), ("Agent", "Thomas Fictional Reed")],
    parrafos=[
        "I, Margaret Example Hughes, hereby appoint Thomas Fictional Reed as my agent to act on my behalf for the limited purposes stated below.",
        "The agent may: (a) sign closing documents for the sale of the property at 12 Sample Lane, Orlando, FL; (b) deposit the proceeds into my account; and (c) communicate with the title company on my behalf.",
        "This power of attorney becomes effective on the date signed and expires on April 5, 2027, unless revoked earlier in writing.",
    ],
    firmas=["Principal: Margaret Example Hughes", "Notary Public: Linda Placeholder, Commission No. 000000"],
    vence="2027-04-05", fecha_escrita="April 5, 2027")

doc("D09", idioma="en", categoria="Banco", titulo="MONTHLY ACCOUNT STATEMENT",
    campos=[("Bank", "First Fictional Bank"), ("Account holder", "Riverside Sample Bakery LLC"),
            ("Account", "****4821"), ("Statement period", "October 1 - October 31, 2026")],
    tabla=[["Date", "Description", "Withdrawals", "Deposits", "Balance"],
           ["10/01", "Opening balance", "", "", "USD 18,240.15"],
           ["10/04", "Card sales deposit", "", "USD 6,312.40", "USD 24,552.55"],
           ["10/10", "Flour supplier payment", "USD 2,980.00", "", "USD 21,572.55"],
           ["10/17", "Payroll", "USD 9,450.00", "", "USD 12,122.55"],
           ["10/28", "Card sales deposit", "", "USD 7,105.90", "USD 19,228.45"]],
    parrafos=["Closing balance on October 31, 2026: USD 19,228.45."],
    firmas=[], vence=None, fecha_escrita=None)

doc("D10", idioma="en", categoria="Contratos", titulo="MUTUAL NON-DISCLOSURE AGREEMENT",
    campos=[("Effective date", "March 15, 2026"), ("Party A", "Northwind Example Software Inc."),
            ("Party B", "Caribbean Fictional Logistics S.R.L.")],
    parrafos=[
        "1. Purpose. The parties wish to evaluate a possible business relationship and may share confidential information for that purpose.",
        "2. Obligations. Each party shall protect the other party's confidential information with at least reasonable care and use it only for the stated purpose.",
        "3. Term. This agreement remains in force for two years from the effective date and expires on March 15, 2028. Obligations regarding trade secrets survive termination.",
        "4. Governing law. This agreement is governed by the laws of the State of New York.",
    ],
    firmas=["Party A: Olivia Sample, CEO", "Party B: Rafael Ficticio, Gerente General"],
    vence="2028-03-15", fecha_escrita="March 15, 2028")

# ---------------- Base para fotos y escaneos, español ----------------
doc("I11", idioma="es", categoria="Seguros", titulo="PÓLIZA DE SEGURO DE VEHÍCULO",
    campos=[("Póliza", "AUTO-55-001928"), ("Aseguradora", "Seguros Ficticios del Atlántico, S.A."),
            ("Asegurado", "María Ejemplo Guzmán"), ("Vehículo", "Toyota Corolla 2022, placa A000000"),
            ("Vigencia", "Desde el 10 de mayo de 2026 hasta el 10 de mayo de 2027")],
    parrafos=["Cobertura: daños a terceros RD$ 1,000,000.00; daños propios hasta el valor de mercado; asistencia vial 24 horas.",
              "Prima anual: RD$ 38,500.00. La póliza vence el 10 de mayo de 2027 y debe renovarse antes de esa fecha para mantener la cobertura."],
    firmas=["Por la Aseguradora: Departamento de Emisión"], vence="2027-05-10", fecha_escrita="10 de mayo de 2027")

doc("I12", idioma="es", categoria="Impuestos", titulo="ACUSE DE RECIBO DE DECLARACIÓN JURADA",
    campos=[("Contribuyente", "Taller Ejemplo Hermanos, S.R.L."), ("RNC", "1-32-55555-5"),
            ("Impuesto", "Impuesto sobre la Renta, ejercicio 2025"), ("Fecha de presentación", "28 de abril de 2026"),
            ("Número de acuse", "ACU-2026-000912")],
    parrafos=["Se certifica la recepción de la declaración jurada del período fiscal 2025 con un impuesto liquidado de RD$ 184,320.00.",
              "Este acuse no constituye prueba de pago. Conserve este documento por un mínimo de diez (10) años."],
    firmas=["Sello de recepción"], vence=None, fecha_escrita=None)

doc("I13", idioma="es", categoria="Identidad y licencias", titulo="CERTIFICADO DE REGISTRO MERCANTIL",
    campos=[("Registro número", "RM-000777-SD"), ("Razón social", "Panadería La Espiga Ficticia, S.R.L."),
            ("Domicilio", "Calle Inventada 45, Santo Domingo Este"), ("Fecha de emisión", "30 de septiembre de 2025")],
    parrafos=["La Cámara de Comercio Ficticia certifica que la sociedad indicada se encuentra inscrita en el Registro Mercantil.",
              "Este certificado tiene validez de dos años y vence el 30 de septiembre de 2027. Debe renovarse para continuar operando."],
    firmas=["Registrador: Lic. Fernando Ejemplo"], vence="2027-09-30", fecha_escrita="30 de septiembre de 2027")

doc("I14", idioma="es", categoria="Facturas", titulo="RECIBO DE PAGO DE ALQUILER",
    campos=[("Recibo", "0458"), ("Fecha", "5 de noviembre de 2026"), ("Recibí de", "Farmacia Nueva Aurora, S.R.L."),
            ("Concepto", "Alquiler del Local 4B, mes de noviembre de 2026")],
    parrafos=["La suma de sesenta y cinco mil pesos dominicanos con 00/100 (RD$ 65,000.00), pagados mediante transferencia bancaria."],
    firmas=["Recibido por: Marta Ficticia Rosario"], vence=None, fecha_escrita=None)

doc("I15", idioma="es", categoria="Contratos", titulo="CONTRATO DE SERVICIOS DE LIMPIEZA",
    campos=[("Cliente", "Bufete Ejemplo & Asociados"), ("Proveedor", "Limpieza Brillante Ficticia, E.I.R.L."),
            ("Fecha", "1 de agosto de 2026")],
    parrafos=["El Proveedor realizará la limpieza de las oficinas del Cliente tres veces por semana, incluyendo pisos, baños y áreas comunes.",
              "La tarifa mensual es de RD$ 22,000.00. El contrato vence el 31 de julio de 2027 y se renueva solo si ambas partes lo acuerdan por escrito."],
    firmas=["Cliente: ______________", "Proveedor: ______________"], vence="2027-07-31", fecha_escrita="31 de julio de 2027")

doc("I16", idioma="es", categoria="Laboral", titulo="CARTA DE TERMINACIÓN DE CONTRATO",
    campos=[("Fecha", "14 de octubre de 2026"), ("Para", "Sr. Andrés Inventado Polanco"), ("De", "Recursos Humanos, Constructora Imaginaria, S.A.")],
    parrafos=["Por medio de la presente le notificamos que su contrato de trabajo termina el 14 de noviembre de 2026, conforme al preaviso establecido en la ley.",
              "Sus prestaciones laborales estarán disponibles en un plazo de diez días a partir de la fecha de terminación."],
    firmas=["Atentamente, Gerencia de Recursos Humanos"], vence=None, fecha_escrita=None)

# ---------------- Base para fotos y escaneos, inglés ----------------
doc("I17", idioma="en", categoria="Seguros", titulo="COMMERCIAL GENERAL LIABILITY POLICY - DECLARATIONS",
    campos=[("Policy number", "CGL-7730192"), ("Insurer", "Atlantic Fictional Insurance Co."),
            ("Named insured", "Riverside Sample Bakery LLC"), ("Policy period", "January 1, 2026 to January 1, 2027")],
    parrafos=["Limits: each occurrence USD 1,000,000; general aggregate USD 2,000,000. Annual premium: USD 2,415.00.",
              "This policy expires on January 1, 2027 at 12:01 a.m. standard time. Renewal must be requested 30 days before expiration."],
    firmas=["Authorized representative"], vence="2027-01-01", fecha_escrita="January 1, 2027")

doc("I18", idioma="en", categoria="Impuestos", titulo="TAX RETURN FILING CONFIRMATION",
    campos=[("Taxpayer", "Harbor Example Accounting LLC"), ("Tax year", "2025"), ("Filed on", "April 14, 2026"),
            ("Confirmation number", "TX-2026-448190")],
    parrafos=["Your return for tax year 2025 was received and accepted. Total tax reported: USD 12,870.00. Amount paid: USD 12,870.00.",
              "Keep this confirmation with your records for at least seven years."],
    firmas=[], vence=None, fecha_escrita=None)

doc("I19", idioma="en", categoria="Identidad y licencias", titulo="BUSINESS LICENSE",
    campos=[("License number", "BL-2026-01188"), ("Business name", "Sunrise Sample Cafe"),
            ("Address", "88 Example Avenue, Orlando, FL"), ("Issued", "June 30, 2026")],
    parrafos=["This license authorizes the business named above to operate as a food service establishment within city limits.",
              "This license expires on June 30, 2027 and must be displayed in a visible place."],
    firmas=["City Licensing Office"], vence="2027-06-30", fecha_escrita="June 30, 2027")

doc("I20", idioma="en", categoria="Facturas", titulo="SALES RECEIPT",
    campos=[("Receipt", "#20931"), ("Date", "November 18, 2026"), ("Store", "Office Fictional Supply")],
    tabla=[["Item", "Qty", "Price"], ["Paper shredder", "1", "USD 129.99"], ["File boxes", "6", "USD 41.94"],
           ["Label printer tape", "4", "USD 35.96"], ["Total", "", "USD 207.89"]],
    parrafos=["Paid by card ending 4821. Returns accepted within 30 days with receipt."],
    firmas=[], vence=None, fecha_escrita=None)

doc("I21", idioma="en", categoria="Contratos", titulo="IT SUPPORT SERVICE AGREEMENT",
    campos=[("Client", "Harbor Example Accounting LLC"), ("Provider", "Bluewave Fictional IT Services"), ("Start date", "October 1, 2026")],
    parrafos=["Provider will deliver remote and on-site IT support for up to 15 workstations, with a response time of four business hours.",
              "Monthly fee: USD 950.00. This agreement ends on September 30, 2027 unless renewed in writing."],
    firmas=["Client: ______________", "Provider: ______________"], vence="2027-09-30", fecha_escrita="September 30, 2027")

doc("I22", idioma="en", categoria="Laboral", titulo="EMPLOYMENT OFFER LETTER",
    campos=[("Date", "November 2, 2026"), ("Candidate", "Sophia Placeholder"), ("Position", "Junior Paralegal")],
    parrafos=["We are pleased to offer you the position of Junior Paralegal at Example & Partners Law Group, starting December 1, 2026.",
              "Your annual salary will be USD 48,000, paid biweekly. Please sign and return this letter by November 16, 2026 to accept this offer."],
    firmas=["Hiring Manager: James Sample", "Accepted by: ______________"], vence="2026-11-16", fecha_escrita="November 16, 2026")

# ---------------- Fechas ambiguas ----------------
doc("A23", idioma="es", categoria="Contratos", titulo="CONTRATO DE MANTENIMIENTO DE ASCENSORES",
    campos=[("Cliente", "Torre Empresarial Ficticia"), ("Proveedor", "Elevadores Ejemplo, S.R.L."), ("Fecha", "03/04/2026")],
    parrafos=["El Proveedor realizará mantenimiento preventivo mensual a los dos ascensores del edificio.",
              "Tarifa mensual: RD$ 18,000.00. Vigencia: un año. Fecha de vencimiento: 03/04/2027."],
    firmas=["Cliente: ______________", "Proveedor: ______________"],
    vence="2027-04-03", fecha_escrita="03/04/2027", ambigua=True, otra_lectura="2027-03-04")

doc("A24", idioma="en", categoria="Seguros", titulo="EXTENDED WARRANTY CERTIFICATE",
    campos=[("Certificate", "EW-55120"), ("Product", "Multifunction printer, model FX-200"), ("Purchase date", "03/04/2026")],
    parrafos=["This certificate extends the manufacturer warranty for parts and labor.",
              "Coverage expires: 03/04/2027."],
    firmas=["Fictional Warranty Services"],
    vence="2027-03-04", fecha_escrita="03/04/2027", ambigua=True, otra_lectura="2027-04-03")

doc("A25", idioma="es", categoria="Seguros", titulo="CERTIFICADO DE SEGURO CONTRA INCENDIO",
    campos=[("Certificado", "INC-2026-3310"), ("Asegurado", "Contadores Ejemplo, S.R.L."), ("Emitido", "05/06/2026")],
    parrafos=["Cubre el local de oficinas contra incendio y líneas aliadas hasta RD$ 3,500,000.00.",
              "Válido hasta: 05/06/2027."],
    firmas=["Seguros Ficticios del Atlántico, S.A."],
    vence="2027-06-05", fecha_escrita="05/06/2027", ambigua=True, otra_lectura="2027-05-06")

doc("A26", idioma="en", categoria="Facturas", titulo="SOFTWARE SUBSCRIPTION RENEWAL NOTICE",
    campos=[("Account", "ACC-90812"), ("Product", "Fictional Ledger Pro, 5 seats"), ("Notice date", "11/12/2026")],
    parrafos=["Your annual subscription will renew automatically. Renewal amount: USD 1,200.00.",
              "Renewal date: 11/12/2027. Cancel before this date to avoid being charged."],
    firmas=[],
    vence="2027-11-12", fecha_escrita="11/12/2027", ambigua=True, otra_lectura="2027-12-11")

# ---------------- Variantes para duplicados (cambio pequeño) ----------------
import copy
_x29 = copy.deepcopy(DOCS["D02"])
_x29["tabla"][1] = ["Resmas de papel carta", "25", "RD$ 350.00", "RD$ 8,750.00"]
_x29["tabla"][4] = ["", "", "Subtotal", "RD$ 25,600.00"]
_x29["tabla"][5] = ["", "", "ITBIS 18%", "RD$ 4,608.00"]
_x29["tabla"][6] = ["", "", "Total", "RD$ 30,208.00"]
_x29["campos"][0] = ("Factura", "B0100004521 (corregida)")
_x29["id"] = "X29"
DOCS["X29"] = _x29

_x30 = copy.deepcopy(DOCS["D06"])
_x30["parrafos"][0] = "1. Term. The lease begins on September 1, 2026 and ends on February 28, 2028, unless renewed in writing by both parties."
_x30["id"] = "X30"; _x30["vence"] = "2028-02-28"; _x30["fecha_escrita"] = "February 28, 2028"
DOCS["X30"] = _x30

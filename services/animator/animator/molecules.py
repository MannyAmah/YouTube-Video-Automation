"""
Real molecular structures for the medication backlog.

Each entry is a canonical SMILES string; RDKit renders the actual 2D
structure. Unknown drugs return None and the caller skips the molecule
visual gracefully (never crashes the render).
"""
from __future__ import annotations
import os
import tempfile

# Curated SMILES for common medications (generic names, lowercase keys).
SMILES: dict[str, str] = {
    "metformin": "CN(C)C(=N)N=C(N)N",
    "atorvastatin": "CC(C)c1c(C(=O)Nc2ccccc2)c(-c2ccccc2)c(-c2ccc(F)cc2)n1CC[C@@H](O)C[C@@H](O)CC(=O)O",
    "lisinopril": "NCCCC[C@@H](N[C@@H](CCc1ccccc1)C(=O)O)C(=O)N1CCC[C@H]1C(=O)O",
    "levothyroxine": "N[C@@H](Cc1cc(I)c(Oc2cc(I)c(O)c(I)c2)c(I)c1)C(=O)O",
    "amlodipine": "CCOC(=O)C1=C(COCCN)NC(C)=C(C(=O)OC)C1c1ccccc1Cl",
    "metoprolol": "COCCc1ccc(OCC(O)CNC(C)C)cc1",
    "omeprazole": "COc1ccc2[nH]c(S(=O)Cc3ncc(C)c(OC)c3C)nc2c1",
    "losartan": "CCCCc1nc(Cl)c(CO)n1Cc1ccc(-c2ccccc2-c2nnn[nH]2)cc1",
    "gabapentin": "NCC1(CC(=O)O)CCCCC1",
    "hydrochlorothiazide": "NS(=O)(=O)c1cc2c(cc1Cl)NCNS2(=O)=O",
    "sertraline": "CNC1CCC(c2ccc(Cl)c(Cl)c2)c2ccccc21",
    "simvastatin": "CCC(C)(C)C(=O)OC1CC(C)C=C2C=CC(C)C(CCC3CC(O)CC(=O)O3)C12",
    "montelukast": "CC(C)(O)c1ccccc1CCC(SCC1(CC(=O)O)CC1)c1cccc(C=Cc2ccc3ccc(Cl)cc3n2)c1",
    "escitalopram": "CN(C)CCCC1(c2ccc(C#N)cc2)OCc2cc(F)ccc21",
    "rosuvastatin": "CC(C)c1nc(N(C)S(C)(=O)=O)nc(-c2ccc(F)cc2)c1C=C[C@@H](O)C[C@@H](O)CC(=O)O",
    "amoxicillin": "CC1(C)SC2C(NC(=O)C(N)c3ccc(O)cc3)C(=O)N2C1C(=O)O",
    "prednisone": "CC12CC(=O)C3C(CCC4=CC(=O)C=CC43C)C1CCC2(O)C(=O)CO",
    "warfarin": "CC(=O)CC(c1ccccc1)c1c(O)c2ccccc2oc1=O",
    "apixaban": "COc1ccc(-n2nc(C(N)=O)c3c2C(=O)N(c2ccc(N4CCCCC4=O)cc2)CC3)cc1",
    "clopidogrel": "COC(=O)C(c1ccccc1Cl)N1CCc2sccc2C1",
    "aspirin": "CC(=O)Oc1ccccc1C(=O)O",
    "ibuprofen": "CC(C)Cc1ccc(C(C)C(=O)O)cc1",
    "acetaminophen": "CC(=O)Nc1ccc(O)cc1",
    "naproxen": "COc1ccc2cc(C(C)C(=O)O)ccc2c1",
    "furosemide": "NS(=O)(=O)c1cc(C(=O)O)c(NCc2ccco2)cc1Cl",
    "pantoprazole": "COc1ccnc(CS(=O)c2nc3ccc(OC(F)F)cc3[nH]2)c1OC",
    "sildenafil": "CCCc1nn(C)c2c1nc([nH]c2=O)-c1cc(S(=O)(=O)N2CCN(C)CC2)ccc1OCC",
    "duloxetine": "CNCCC(Oc1cccc2ccccc12)c1cccs1",
    "atenolol": "CC(C)NCC(O)COc1ccc(CC(N)=O)cc1",
    "citalopram": "CN(C)CCCC1(c2ccc(C#N)cc2)OCc2cc(F)ccc21",
    "fluoxetine": "CNCCC(Oc1ccc(C(F)(F)F)cc1)c1ccccc1",
    "tramadol": "COc1cccc(C2(O)CCCCC2CN(C)C)c1",
    "meloxicam": "Cc1cnc(NC(=O)c2c(O)c3ccccc3s(=O)(=O)n2C)s1",
    "spironolactone": "CC(=O)SC1CC2C3CCC4=CC(=O)CCC4(C)C3CCC2(C)C12CCC(=O)O2",
    "sitagliptin": "N[C@@H](CC(=O)N1CCn2c(nnc2C(F)(F)F)C1)Cc1cc(F)c(F)cc1F",
    "empagliflozin": "OC[C@H]1O[C@@H](c2ccc(Cl)c(Cc3ccc(O[C@H]4CCOC4)cc3)c2)[C@H](O)[C@@H](O)[C@@H]1O",
    "semaglutide": None,  # peptide — no small-molecule 2D structure
    "insulin glargine": None,
    "albuterol": "CC(C)(C)NCC(O)c1ccc(O)c(CO)c1",
    "montelukast": "CC(C)(O)c1ccccc1CCC(SCC1(CC(=O)O)CC1)c1cccc(C=Cc2ccc3ccc(Cl)cc3n2)c1",
    "propranolol": "CC(C)NCC(O)COc1cccc2ccccc12",
    "carvedilol": "COc1ccccc1OCCNCC(O)COc1cccc2[nH]c3ccccc3c12",
    "venlafaxine": "COc1ccc(C(CN(C)C)C2(O)CCCCC2)cc1",
    "bupropion": "CC(NC(C)(C)C)C(=O)c1cccc(Cl)c1",
    "trazodone": "O=c1n(CCCN2CCN(c3cccc(Cl)c3)CC2)nc2ccccn12",
    "glipizide": "Cc1cnc(C(=O)NCCc2ccc(S(=O)(=O)NC(=O)NC3CCCCC3)cc2)cn1",
    "ezetimibe": "O[C@H](CC[C@H]1[C@@H](c2ccc(O)cc2)N(c2ccc(F)cc2)C1=O)c1ccc(F)cc1",
    "allopurinol": "O=c1[nH]cnc2[nH]ncc12",
    "famotidine": "NC(N)=Nc1nc(CSCCC(N)=NS(N)(=O)=O)cs1",
    "ondansetron": "Cc1nccn1CC1CCc2c(c3ccccc3n2C)C1=O",
    "loratadine": "CCOC(=O)N1CCC(=C2c3ccc(Cl)cc3CCc3cccnc32)CC1",
    "cetirizine": "OC(=O)COCCN1CCN(C(c2ccccc2)c2ccc(Cl)cc2)CC1",
    "doxycycline": "CC1c2cccc(O)c2C(=O)C2=C(O)C3(O)C(=O)C(C(N)=O)=C(O)C(N(C)C)C3C(O)C12",
    "azithromycin": "CCC1OC(=O)C(C)C(OC2CC(C)(OC)C(O)C(C)O2)C(C)C(OC2OC(C)CC(N(C)C)C2O)C(C)(O)CC(C)CN(C)C(C)C(O)C1(C)O",
    "prednisolone": "CC12CC(O)C3C(CCC4=CC(=O)C=CC43C)C1CCC2(O)C(=O)CO",
    "tamsulosin": "CCOc1ccccc1OCCNC(C)Cc1ccc(OC)c(S(N)(=O)=O)c1",
    "clonazepam": "O=C1CN=C(c2ccccc2Cl)c2cc([N+](=O)[O-])ccc2N1",
    "alprazolam": "Cc1nnc2n1-c1ccc(Cl)cc1C(c1ccccc1)=NC2",
    "lorazepam": "OC1N=C(c2ccccc2Cl)c2cc(Cl)ccc2NC1=O",
    "zolpidem": "Cc1ccc(-c2c(CC(=O)N(C)C)nc3ccc(C)cn23)cc1",
    "quetiapine": "OCCOCCN1CCN(C2=Nc3ccccc3Sc3ccccc32)CC1",
    "aripiprazole": "O=C1CCc2ccc(OCCCCN3CCN(c4cccc(Cl)c4Cl)CC3)cc2N1",
    "lamotrigine": "Nc1nnc(-c2cccc(Cl)c2Cl)c(N)n1",
    "levetiracetam": "CCC(C(N)=O)N1CCCC1=O",
    "topiramate": "CC1(C)OC2COC3(COS(N)(=O)=O)OC(C)(C)OC3C2O1",
    "pravastatin": "CCC(C)C(=O)OC1CC(O)C=C2C=CC(C)C(CCC(O)CC(O)CC(=O)O)C12",
    "rosuvastatin": "CC(C)c1nc(N(C)S(C)(=O)=O)nc(-c2ccc(F)cc2)c1C=C[C@@H](O)C[C@@H](O)CC(=O)O",
    "diclofenac": "O=C(O)Cc1ccccc1Nc1c(Cl)cccc1Cl",
    "celecoxib": "Cc1ccc(-c2cc(C(F)(F)F)nn2-c2ccc(S(N)(=O)=O)cc2)cc1",
    "finasteride": "CC12CCC3C(CCC4=CC(=O)C=CC43C)C1CCC2C(=O)NC(C)(C)C",
    "warfarin": "CC(=O)CC(c1ccccc1)c1c(O)c2ccccc2oc1=O",
    "hydroxyzine": "OCCOCCN1CCN(C(c2ccccc2)c2ccc(Cl)cc2)CC1",
    "buspirone": "O=C1CC2(CCCC2)CC(=O)N1CCCCN1CCN(c2ncccn2)CC1",
    "clonidine": "Clc1cccc(Cl)c1NC1=NCCN1",

    # --- Real biological molecules (the actual players in mechanisms) ---
    "glucose": "OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O",
    "atp": "Nc1ncnc2c1ncn2[C@@H]1O[C@H](COP(=O)(O)OP(=O)(O)OP(=O)(O)O)[C@@H](O)[C@H]1O",
    "adp": "Nc1ncnc2c1ncn2[C@@H]1O[C@H](COP(=O)(O)OP(=O)(O)O)[C@@H](O)[C@H]1O",
    "amp": "Nc1ncnc2c1ncn2[C@@H]1O[C@H](COP(=O)(O)O)[C@@H](O)[C@H]1O",
    "cyclic amp": "Nc1ncnc2c1ncn2C1OC2COP(=O)(O)OC2C1O",
    "camp": "Nc1ncnc2c1ncn2C1OC2COP(=O)(O)OC2C1O",
    "pyruvate": "CC(=O)C(=O)O",
    "lactate": "CC(O)C(=O)O",
    "acetyl-coa": "CC(=O)SCCNC(=O)CCNC(=O)C(O)C(C)(C)COP(=O)(O)OP(=O)(O)OCC1OC(n2cnc3c(N)ncnc32)C(O)C1OP(=O)(O)O",
    "cholesterol": "CC(C)CCCC(C)C1CCC2C1(C)CCC1C2CC=C2CC(O)CCC12C",
    "mevalonate": "CC(O)(CCO)CC(=O)O",
    "hmg-coa": "CC(O)(CC(=O)O)CC(=O)SCCNC(=O)CCNC(=O)C(O)C(C)(C)COP(=O)(O)OP(=O)(O)OCC1OC(n2cnc3c(N)ncnc32)C(O)C1OP(=O)(O)O",
    "dopamine": "NCCc1ccc(O)c(O)c1",
    "serotonin": "NCCc1c[nH]c2ccc(O)cc12",
    "gaba": "NCCCC(=O)O",
    "glutamate": "N[C@@H](CCC(=O)O)C(=O)O",
    "acetylcholine": "CC(=O)OCC[N+](C)(C)C",
    "norepinephrine": "NC[C@H](O)c1ccc(O)c(O)c1",
    "epinephrine": "CNC[C@H](O)c1ccc(O)c(O)c1",
    "histamine": "NCCc1c[nH]cn1",
    "adenosine": "Nc1ncnc2c1ncn2[C@@H]1O[C@H](CO)[C@@H](O)[C@H]1O",
    "uric acid": "O=c1[nH]c2[nH]c(=O)[nH]c2c(=O)[nH]1",
    "hypoxanthine": "O=c1[nH]cnc2nc[nH]c12",
    "xanthine": "O=c1[nH]c(=O)c2[nH]cnc2[nH]1",
    "cortisol": "CC12CCC(=O)C=C1CCC1C2C(O)CC2(C)C1CCC2(O)C(=O)CO",
    "thromboxane": "CCCCCC(O)C=CC1OC2(CCCCCCC(=O)O)OC1CC2",
    "arachidonic acid": "CCCCCC=CCC=CCC=CCC=CCCCC(=O)O",
    "prostaglandin": "CCCCCC(O)C=CC1C(O)CC(=O)C1CC=CCCCC(=O)O",
    "nitric oxide": "[N]=O",
    "angiotensin ii": None,  # peptide
    "gastric acid": "Cl",
    "sodium": "[Na+]",
    "potassium": "[K+]",
    "calcium": "[Ca+2]",
    "chloride": "[Cl-]",
    "water": "O",
    "carbon dioxide": "O=C=O",
    "folate": "Nc1nc2ncc(CNc3ccc(C(=O)NC(CCC(=O)O)C(=O)O)cc3)nc2c(=O)[nH]1",
    "thyroxine": "N[C@@H](Cc1cc(I)c(Oc2cc(I)c(O)c(I)c2)c(I)c1)C(=O)O",
    "insulin": None,  # peptide
    "warfarin epoxide": None,
}


def get_smiles(name: str) -> str | None:
    return SMILES.get(name.strip().lower())


def render_molecule(name: str, out_path: str, size=(900, 600)) -> bool:
    """Render a real 2D structure to PNG. Returns True on success."""
    smiles = get_smiles(name)
    if not smiles:
        return False
    try:
        from rdkit import Chem
        from rdkit.Chem import AllChem
        from rdkit.Chem.Draw import rdMolDraw2D

        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            return False
        AllChem.Compute2DCoords(mol)
        d = rdMolDraw2D.MolDraw2DCairo(size[0], size[1])
        opts = d.drawOptions()
        opts.bondLineWidth = 5
        opts.padding = 0.12
        opts.clearBackground = False
        # White-ish structure on transparent for dark backgrounds.
        opts.setAtomPalette({-1: (0.91, 0.93, 0.97)})
        rdMolDraw2D.PrepareAndDrawMolecule(d, mol)
        d.FinishDrawing()
        with open(out_path, "wb") as f:
            f.write(d.GetDrawingText())
        return True
    except Exception:
        return False

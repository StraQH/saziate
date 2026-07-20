import os
import glob

def replace_in_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        new_content = content.replace('"psp_lekki_green"', 'MOCK_PSP_ID')
        new_content = new_content.replace('"agent_lekki_1"', 'MOCK_AGENT_ID')
        new_content = new_content.replace('"route_lekki_1"', 'MOCK_ROUTE_ID')
        
        if new_content != content:
            # Need to ensure MOCK_PSP_ID or others are imported
            if 'MOCK_PSP_ID' in new_content or 'MOCK_AGENT_ID' in new_content or 'MOCK_ROUTE_ID' in new_content:
                if 'from "@/lib/mockdata"' in new_content:
                    if 'MOCK_PSP_ID' in new_content and 'MOCK_PSP_ID' not in content:
                        new_content = new_content.replace('from "@/lib/mockdata"', ', MOCK_PSP_ID } from "@/lib/mockdata"')
                        new_content = new_content.replace('}, MOCK_PSP_ID }', '} from')
                else:
                    lines = new_content.split('\n')
                    imports = []
                    if 'MOCK_PSP_ID' in new_content: imports.append('MOCK_PSP_ID')
                    if 'MOCK_AGENT_ID' in new_content: imports.append('MOCK_AGENT_ID')
                    if 'MOCK_ROUTE_ID' in new_content: imports.append('MOCK_ROUTE_ID')
                    import_str = 'import { ' + ', '.join(imports) + ' } from "@/lib/mockdata";'
                    # Insert after the last import, or at the top
                    lines.insert(0, import_str)
                    new_content = '\n'.join(lines)
            
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f'Updated {filepath}')
    except Exception as e:
        pass

for root, _, files in os.walk('src'):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            replace_in_file(os.path.join(root, file))
